UPDATE `xswc_finance_assistant`.`fa_storage_settlement` SET  `deleted` = 1 WHERE `id` = 1078;
UPDATE `xswc_finance_assistant`.`fa_storage_order_publish` SET `deleted` = 1 WHERE `id` in (1077,1006);

UPDATE `xswc_finance_assistant`.`fa_storage_order` SET	stock_quantity = 0	 where storage_order_no = 'DC202606040103';
UPDATE `xswc_finance_assistant`.`fa_storage_order` SET	stock_quantity = 0	 where storage_order_no = 'DC202606040139';
UPDATE `xswc_finance_assistant`.`fa_storage_order` SET	stock_quantity = 0	 where storage_order_no = 'DC202606040140';
UPDATE `xswc_finance_assistant`.`fa_storage_order` SET	stock_quantity = 0	 where storage_order_no = 'DC202606040163';
UPDATE `xswc_finance_assistant`.`fa_storage_order` SET	stock_quantity = 0	 where storage_order_no = 'DC202606040172';
UPDATE `xswc_finance_assistant`.`fa_storage_order` SET	stock_quantity = 0	 where storage_order_no = 'DC202606040227';
UPDATE `xswc_finance_assistant`.`fa_storage_order` SET	stock_quantity = 0	 where storage_order_no = 'DC202606040504';
UPDATE `xswc_finance_assistant`.`fa_storage_order` SET	stock_quantity = 0	 where storage_order_no = 'DC202606040626';
UPDATE `xswc_finance_assistant`.`fa_storage_order` SET	stock_quantity = 0	 where storage_order_no = 'DC202606040651';
UPDATE `xswc_finance_assistant`.`fa_storage_order` SET	stock_quantity = 0	 where storage_order_no = 'DC202606040732';
UPDATE `xswc_finance_assistant`.`fa_storage_order` SET	stock_quantity = 0	 where storage_order_no = 'DC202606040764';