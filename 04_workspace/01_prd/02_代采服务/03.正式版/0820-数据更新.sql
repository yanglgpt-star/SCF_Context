UPDATE `xswc_finance_assistant`.`fa_storage_settlement` SET  `deposit_status` = 3, `service_fee_status` = 3, `settle_status` = 2 WHERE `settle_status` != 2;
UPDATE `xswc_finance_assistant`.`fa_purchase_agreement_order` SET   `stock_in_quantity` = `quantity` WHERE deleted = 0 AND quantity != stock_in_quantity;
	