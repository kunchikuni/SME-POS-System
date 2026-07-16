<?php

namespace App\Domain\Tenancy;

use App\Models\Tenant;
use Illuminate\Auth\EloquentUserProvider;
use Illuminate\Contracts\Auth\Authenticatable;

/**
 * Authenticates users without leaning on the BelongsToTenant global scope.
 *
 * Why this exists: session re-hydration calls retrieveById() on every request.
 * If that lookup went through the tenant global scope, it would return null
 * whenever tenant context wasn't set at that exact moment — which desynced the
 * `auth` and `guest` middleware and produced an infinite /login <-> /dashboard
 * redirect loop.
 *
 * Instead we look the user up by their (globally-unique) id with no scope, then
 * explicitly confirm they belong to the tenant for THIS request's host. That is
 * also a security gain: with a subdomain-shared session cookie, it rejects a
 * session minted on tenant A from being replayed on tenant B's subdomain.
 */
class TenantUserProvider extends EloquentUserProvider
{
    public function retrieveById($identifier): ?Authenticatable
    {
        $model = $this->createModel();

        $user = $model->newQuery()
            ->withoutGlobalScopes()
            ->where($model->getAuthIdentifierName(), $identifier)
            ->first();

        return $this->belongsToCurrentTenant($user) ? $user : null;
    }

    public function retrieveByToken($identifier, #[\SensitiveParameter] $token): ?Authenticatable
    {
        $model = $this->createModel();

        $user = $model->newQuery()
            ->withoutGlobalScopes()
            ->where($model->getAuthIdentifierName(), $identifier)
            ->first();

        if (! $this->belongsToCurrentTenant($user)) {
            return null;
        }

        $rememberToken = $user->getRememberToken();

        return $rememberToken && hash_equals($rememberToken, $token) ? $user : null;
    }

    public function retrieveByCredentials(#[\SensitiveParameter] array $credentials): ?Authenticatable
    {
        $model = $this->createModel();

        $query = $model->newQuery()->withoutGlobalScopes();

        // Login is still tenant-scoped — but explicitly, by the current host's
        // tenant, not via the ambient global scope.
        if ($tenantId = $this->currentTenantId()) {
            $query->where('tenant_id', $tenantId);
        }

        foreach ($credentials as $key => $value) {
            if (str_contains($key, 'password')) {
                continue;
            }
            $query->where($key, $value);
        }

        return $query->first();
    }

    private function belongsToCurrentTenant(?Authenticatable $user): bool
    {
        if ($user === null) {
            return false;
        }

        $tenantId = $this->currentTenantId();

        // No resolvable tenant (e.g. a non-tenant host) → not authenticated here.
        return $tenantId !== null && $user->getAttribute('tenant_id') === $tenantId;
    }

    /**
     * The tenant for the current request. Prefers the already-resolved context;
     * falls back to deriving it from the host so auth is independent of whether
     * ResolveTenant has run yet in the middleware pipeline.
     */
    private function currentTenantId(): ?string
    {
        $context = app(TenantContext::class);
        if ($context->has()) {
            return $context->id();
        }

        $host = request()?->getHost();
        if ($host === null) {
            return null;
        }

        $subdomain = str($host)->before('.' . config('brand.tenant_domain'))->toString();
        if ($subdomain === '' || $subdomain === $host) {
            return null;
        }

        return Tenant::withoutGlobalScopes()->where('subdomain', $subdomain)->value('id');
    }
}
