-- 代储协议
UPDATE `xswc_finance_assistant`.`fa_purchase_agreement` SET  `agent_purchase_amount` = 2400000.00 WHERE `id` = 21;
-- 代采订单修改
UPDATE `xswc_finance_assistant`.`fa_purchase_agreement_order` SET  `unit_price` = 300.00, `quantity` = 5500, `total_price` = 1650000.00, `picked_quantity` = 5500, `unpicked_quantity` = 0 WHERE `id` = 170;
UPDATE `xswc_finance_assistant`.`fa_purchase_agreement_order` SET  `unit_price` = 1720.00, `quantity` = 1190, `total_price` = 2046800.00,  `picked_quantity` = 1190, `unpicked_quantity` = 0, `stock_in_quantity` = 1190  WHERE `id` = 183;
UPDATE `xswc_finance_assistant`.`fa_purchase_agreement_order` SET  `unit_price` = 1720.00, `quantity` = 300, `total_price` = 516000.00,  `picked_quantity` = 300, `unpicked_quantity` = 0, `stock_in_quantity` = 300 WHERE `id` = 184;


-- 销售修改
UPDATE `xswc_finance_assistant`.`fa_sales_order` SET  `agreement_no` = 'DCXY202606040016', `order_code` = '8ede418803b000d' WHERE `id` = 271;
UPDATE `xswc_finance_assistant`.`fa_sales_order` SET  `order_code` = '8eca942803ae0f7',`common_name` = '华为 Mate 70 Pro 优享版', `common_sku` = '雪域白-12GB+512GB', `common_code` = 'N99801080E03001F02', `sku_code` = 'N99801080E03001F02' WHERE `id` = 272;
UPDATE `xswc_finance_assistant`.`fa_sales_order` SET  `purchase_price` = 1724.73, `quantity` = 300, `sales_price` = 1724.73, `sales_quantity` = 300 WHERE `id` = 287;
UPDATE `xswc_finance_assistant`.`fa_sales_order` SET  `purchase_price` = 1724.30, `quantity` = 890, `sales_price` = 1724.30, `sales_quantity` = 890 WHERE `id` = 285;


UPDATE `xswc_finance_assistant`.`fa_purchase_agreement` SET  `deleted` = 1 WHERE `id` = 36;
UPDATE `xswc_finance_assistant`.`fa_purchase_agreement_detail` SET  `deleted` = 1 WHERE agreement_id = 36;
UPDATE `xswc_finance_assistant`.`fa_purchase_agreement_order` SET  `deleted` = 1 WHERE agreement_no = 'DCXY202607685774';
UPDATE `xswc_finance_assistant`.`fa_deposit_manage` SET `deleted` = 1 WHERE agreement_no = 'DCXY202607685774';
UPDATE `xswc_finance_assistant`.`fa_purchase_order_stock_in` SET `deleted` = 1 WHERE agreement_no = 'DCXY202607685774';


