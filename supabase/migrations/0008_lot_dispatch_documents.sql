-- v2-7: 5 more document upload fields on the Add/Edit Lot Dispatch form (E-way Bill,
-- Delivery Chalan, LR Copy Receiving, Packing List, Other), alongside the existing lr_copy_url.
-- All nullable, all optional — matches lr_copy_url's existing behavior exactly.
alter table material_lots add column if not exists eway_bill_url text;
alter table material_lots add column if not exists delivery_chalan_url text;
alter table material_lots add column if not exists lr_copy_receiving_url text;
alter table material_lots add column if not exists packing_list_url text;
alter table material_lots add column if not exists other_document_url text;
