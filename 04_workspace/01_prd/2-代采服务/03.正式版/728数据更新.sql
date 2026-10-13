UPDATE `xswc_finance_assistant`.`fa_storage_settlement` SET  `deleted` = 0 WHERE `id` in (147,170,227,757,765,775,849,987);
UPDATE `xswc_finance_assistant`.`fa_sales_order` SET  `deleted` = 0 WHERE `id` = 226;
UPDATE `xswc_finance_assistant`.`fa_sales_order` SET  `deleted` = 1 WHERE `id` = 294;

UPDATE `xswc_finance_assistant`.`fa_storage_settlement` SET `evaluate_price` = 1050.00, `sale_price` = 1078.88, `quantity` = 25, `evaluate_price_amount` = 26250.00, `sale_price_amount` = 26972.88, `deposit_amount` = 26250.00, `service_amount` = 722 WHERE `id` = 1079;
UPDATE `xswc_finance_assistant`.`fa_storage_settlement` SET `evaluate_price` = 55.00, `sale_price` = 56.42, `quantity` = 20, `evaluate_price_amount` = 1100.00, `sale_price_amount` = 1128.40, `deposit_amount` = 1100.00, `service_amount` = 28.40 WHERE `id` = 1063;
UPDATE `xswc_finance_assistant`.`fa_sales_order` SET `order_code` = '8ed472a003af03b', `common_name` = 'Mate 70 Pro 优享版', `common_sku` = '雪域白-12GB+512GB', `common_code` = 'N99801080E03001F02', `sku_code` = 'N99801080E03001F02' WHERE `id` = 353;
UPDATE `xswc_finance_assistant`.`fa_purchase_agreement_order` SET  `unit_price` = 700.00, `quantity` = 10, `total_price` = 7000.00 WHERE `id` = 164;

UPDATE `xswc_finance_assistant`.`fa_sales_order` SET  `order_code` = '851b6d68023a9ed', `subscribe_type` = 1,`sales_order_code` = '8e27f44800b58ac', `category` = '电脑', `brand` = '华为', `common_name` = '华为 MateBook D 14', `common_sku` = '深空灰-第13代酷睿i5-1340P-1TB-16GB', `common_code` = 'N00303071G0300FJ01', `sku_code` = 'N00303071G0300FJ01' WHERE `id` = 146;

UPDATE `xswc_finance_assistant`.`fa_sales_order` SET  `purchase_price` = 1724.30, `quantity` = 700, `sales_price` = 1724.30, `sales_quantity` = 700 WHERE `id` = 285;


UPDATE `xswc_finance_assistant`.`fa_sales_order` SET  `order_date` = '2026-05-17 00:00:00', `payment_date` = '2026-05-17 00:00:00' WHERE `id` = 226;