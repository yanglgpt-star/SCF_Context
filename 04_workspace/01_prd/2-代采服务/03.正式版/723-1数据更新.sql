-- 代采明细更新
UPDATE `xswc_finance_assistant`.`fa_purchase_agreement_detail` SET  `price` = 300.00, `quantity` = 5500, `purchase_total_price` = 1650000.00 WHERE `id` = 170;
UPDATE `xswc_finance_assistant`.`fa_purchase_agreement_detail` SET  `brand` = '联想', `common_name` = '联想拯救者 Y9000P 2026', `common_sku` = '碳晶黑-16-R9-8945HX-1T-16G-RTX5060[83QC0002CD]', `common_code` = 'XS24BMA2D002HTB001', `sku_code` = 'XS24BMA2D002HTB001' WHERE `id` = 328;
UPDATE `xswc_finance_assistant`.`fa_purchase_agreement_order` SET `order_code` = '93fa5e580511465',  `category` = '笔记本', `brand` = '联想', `common_code` = 'XS24BMA2D002HTB001', `common_sku` = '碳晶黑-16-R9-8945HX-1T-16G-RTX5060[83QC0002CD]', `sku_code` = 'XS24BMA2D002HTB001', `common_name` = '联想拯救者 Y9000P 2026'  WHERE `id` = 205;

-- 保证金修改
UPDATE `xswc_finance_assistant`.`fa_deposit_manage` SET  `deleted` = 0 WHERE `id` = 37;
UPDATE `xswc_finance_assistant`.`fa_deposit_manage` SET  `deleted` = 1 WHERE `id` = 26;