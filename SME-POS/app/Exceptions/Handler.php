<?php

namespace App\Exceptions;

use Illuminate\Foundation\Exceptions\Handler as ExceptionHandler;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Throwable;

class Handler extends ExceptionHandler
{
    public function register(): void
    {
        $this->reportable(function (NotFoundHttpException $e) {
            \Log::error('404 Not Found', [
                'url' => request()->fullUrl(),
                'method' => request()->method(),
                'referer' => request()->header('referer'),
            ]);
        });
    }
}
