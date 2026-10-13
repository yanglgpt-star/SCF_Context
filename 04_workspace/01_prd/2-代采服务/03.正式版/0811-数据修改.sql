UPDATE `xswc_finance_assistant`.`fa_sales_order` SET `activity_id` = null, `activity_no` = null , `sales_demand_code` = null, `sales_order_code` = '9025785800bb023-1' WHERE `id` = 200;
UPDATE `xswc_finance_assistant`.`fa_sales_order` SET  `sales_order_code` = '9390bd8800d7133-1',stock_out_completed = 0 WHERE `id` = 342;
UPDATE `xswc_finance_assistant`.`fa_sales_order` SET `sales_order_code` = 'hw0807-10-1' WHERE `id` = 357;
UPDATE `xswc_finance_assistant`.`fa_sales_order` SET  `stock_out_completed` = 0 WHERE `id` = 225;
UPDATE `xswc_finance_assistant`.`fa_sales_order` SET  `sales_order_code` = '8f48058800b89e5-1',stock_out_completed = 0 WHERE `id` = 163;
-- 出库数量修改
UPDATE `xswc_finance_assistant`.`fa_sales_order_stock_out` SET	stock_out_quantity	= 2000	where  sales_order_code = 'XS0001';
UPDATE `xswc_finance_assistant`.`fa_sales_order_stock_out` SET	stock_out_quantity	= 12000	where  sales_order_code = 'XS0002';
UPDATE `xswc_finance_assistant`.`fa_sales_order_stock_out` SET	stock_out_quantity	= 11000	where  sales_order_code = 'XS0003';
UPDATE `xswc_finance_assistant`.`fa_sales_order_stock_out` SET	stock_out_quantity	= 5000	where  sales_order_code = 'XS0004';
UPDATE `xswc_finance_assistant`.`fa_sales_order_stock_out` SET	stock_out_quantity	= 3000	where  sales_order_code = 'XS0005';
UPDATE `xswc_finance_assistant`.`fa_sales_order_stock_out` SET	stock_out_quantity	= 2100	where  sales_order_code = 'XS0006';
UPDATE `xswc_finance_assistant`.`fa_sales_order_stock_out` SET	stock_out_quantity	= 490	where  sales_order_code = 'BL0706-038';
UPDATE `xswc_finance_assistant`.`fa_sales_order_stock_out` SET	stock_out_quantity	= 300	where  sales_order_code = 'BL0706-039';


UPDATE `xswc_finance_assistant`.`fa_sales_order_stock_out` SET  `deleted` = 1 WHERE `id` in (319,366,367);


