UPDATE `xswc_finance_assistant`.`fa_storage_settlement` SET  `deleted` = 1 WHERE `id` = 940;
UPDATE `xswc_finance_assistant`.`fa_storage_settlement` SET  `deleted` = 1 WHERE `id` = 333;
UPDATE `xswc_finance_assistant`.`fa_storage_order_publish` SET  `deleted` = 1 WHERE `id` = 939;
UPDATE `xswc_finance_assistant`.`fa_storage_order_publish` SET  `deleted` = 1 WHERE `id` = 333;

INSERT INTO fa_storage_order_publish
    (storage_order_code, storage_order_no, sale_order_no, sales_channel, pickup_type,
     evaluate_price, sale_quantity, sale_price, service_rate, storage_fee, deposit_rate,
     service_amount, storage_amount, deposit_amount, min_sale_price,
     service_amount_unit, storage_amount_unit,
     customer_id, customer_name, receive_province_id, receive_city_id, receive_area_id,
     receive_address, receive_name, receive_phone,
     business_owner_id, warehouse_id, warehouse_name,
     allocate_time, publish_time, order_status, deleted,
     create_by, create_time, update_by, update_time)
VALUES
    ('2124814392880592040', 'DC202606040234', 'ma-9284a8080050626-2', 1, 1,
     2800.00, 60, 2859.10, 0.00025, 2.40, 1.00,
     5319.00, 540.00, 168000.00, 59.18,
     59.10, 0.08,
     85430, '李冰6596', 410000, 410100, 410122,
     '河南省郑州市中牟县九龙镇龙飞南街88号海通汽配物流园A库1层西北角 醒市无仓 张德鹏 15253746500', '李冰', 15516636596,
     3101, 3595, '上海监管仓',
     '2026-04-02 00:00:00', '2026-06-17 00:00:00', 3, 0,
     386864,'2026-06-17 00:00:00', 386864, '2026-06-17 00:00:00');