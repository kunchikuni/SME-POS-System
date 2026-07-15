<?php

namespace App\Domain\Inventory;

/** Why a stock movement happened. Stored on every ledger row. */
enum StockReason: string
{
    case Initial     = 'initial';      // opening quantity when a product is created/imported
    case Sale        = 'sale';         // -qty at checkout
    case Purchase    = 'purchase';     // +qty from a supplier
    case TransferIn  = 'transfer_in';
    case TransferOut = 'transfer_out';
    case Adjustment  = 'adjustment';   // manual stock-take correction
}
