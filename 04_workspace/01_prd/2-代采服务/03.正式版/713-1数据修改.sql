-- 结算数据修改
UPDATE `xswc_finance_assistant`.`fa_storage_settlement` SET	evaluate_price = 1250,	sale_price = 1255.25,	quantity = 200,	evaluate_price_amount = 250000,	sale_price_amount = 251050,	deposit_amount = 250000	where id = 962;
-- 看板数据清理
TRUNCATE TABLE xswc_finance_assistant.fa_asset_daily_capital;