<?php

namespace App\Http\Controllers;

use App\Models\Category;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class CategoryController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('Categories/Index', [
            'categories' => Category::withCount('products')->orderBy('name')->get(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $this->authorize('administer');

        $request->validate([
            'name' => [
                'required', 'string', 'max:80',
                Rule::unique('categories', 'name')
                    ->where('tenant_id', app(\App\Domain\Tenancy\TenantContext::class)->id()),
            ],
        ]);

        Category::create(['name' => $request->string('name')]);

        return to_route('categories.index')->with('flash', 'Category added.');
    }

    public function destroy(Category $category): RedirectResponse
    {
        $this->authorize('administer');
        $category->delete();

        return to_route('categories.index')->with('flash', 'Category removed.');
    }
}
