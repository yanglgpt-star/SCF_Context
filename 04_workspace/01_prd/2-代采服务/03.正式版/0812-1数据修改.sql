UPDATE `xswc_finance_assistant`.`fa_purchase_agreement_detail` SET  `price` = 1203.00, `quantity` = 1400 WHERE `id` = 132;

UPDATE `xswc_finance_assistant`.`fa_purchase_order_stock_in` SET  `stock_in_quantity` = 2450 WHERE `id` = 74;
UPDATE `xswc_finance_assistant`.`fa_purchase_order_stock_in` SET  `deleted` = 1 WHERE `id` = 75;
UPDATE `xswc_finance_assistant`.`fa_sales_order_stock_out` SET  `deleted` = 0 WHERE `id` = 242;
UPDATE `xswc_finance_assistant`.`fa_sales_order_stock_out` SET  `deleted` = 1 WHERE `id` in (322,323,364,365,369,370,379,380,371,375,368,372,383);

UPDATE `xswc_finance_assistant`.`fa_sales_order` SET  `purchase_price` = 1079.85, `quantity` = 300, `sales_price` = 1079.85, `sales_quantity` = 300 WHERE `id` = 274;


UPDATE `xswc_finance_assistant`.`fa_sales_order` SET `order_code` = '8f1abb0803b9562' WHERE `id` = 201;
UPDATE `xswc_finance_assistant`.`fa_sales_order_stock_out` SET  `order_code` = '8f1abb0803b9562' WHERE `id` = 45;