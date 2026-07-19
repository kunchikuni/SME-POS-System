<?php

namespace App\Http\Controllers;

use App\Domain\Tenancy\TenantContext;
use App\Jobs\ImportProductsCsv;
use App\Models\Branch;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ImportProductsController extends Controller
{
    public function create(): Response
    {
        return Inertia::render('Products/Import');
    }

    public function store(Request $request, TenantContext $context): RedirectResponse
    {
        abort_unless($request->user()->can('administer'), 403);

        $request->validate([
            'file' => ['required', 'file', 'mimes:csv,txt', 'max:5120'], // 5 MB
        ]);

        // Store under a tenant-scoped path; the job deletes it when done.
        $path = $request->file('file')->store("imports/{$context->id()}");

        $branchId = Branch::where('is_default', true)->value('id')
            ?? Branch::query()->value('id');

        ImportProductsCsv::dispatch($context->id(), $path, $branchId);

        return to_route('products.index')
            ->with('flash', 'Import started. Products will appear shortly.');
    }
}
