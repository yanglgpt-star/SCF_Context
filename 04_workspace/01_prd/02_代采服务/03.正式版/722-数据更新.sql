-- 代采协议
UPDATE `xswc_finance_assistant`.`fa_purchase_agreement` SET  `agent_purchase_amount` = 2103894.00 WHERE `id` = 4;
UPDATE `xswc_finance_assistant`.`fa_purchase_agreement` SET  `agent_purchase_amount` = 2280000.00 WHERE `id` = 21;
-- 代采订单修改
UPDATE `xswc_finance_assistant`.`fa_purchase_agreement_order` SET  `unit_price` = 300.00, `quantity` = 5100, `total_price` = 1530000.00, `picked_quantity` = 5100, `unpicked_quantity` = 0 WHERE `id` = 170;



-- 删除
UPDATE `xswc_finance_assistant`.`fa_purchase_agreement` SET  `deleted` = 1 WHERE `id` = 35;
UPDATE `xswc_finance_assistant`.`fa_purchase_agreement_detail` SET  `deleted` = 1 WHERE agreement_id = 35;
UPDATE `xswc_finance_assistant`.`fa_purchase_agreement_order` SET  `deleted` = 1 WHERE agreement_no = 'DCXY202607463483';
UPDATE `xswc_finance_assistant`.`fa_deposit_manage` SET `deleted` = 1 WHERE agreement_no = 'DCXY202607463483';
UPDATE `xswc_finance_assistant`.`fa_purchase_order_stock_in` SET `deleted` = 1 WHERE agreement_no = 'DCXY202607463483';

UPDATE `xswc_finance_assistant`.`fa_activity_info` SET `deleted` = 1 WHERE `agreement_no` in ('DCXY202606040002','DCXY202606040004','DCXY202606040008','DCXY202606040011','DCXY202606040026','DCXY202606040020','DCXY202606040017');

