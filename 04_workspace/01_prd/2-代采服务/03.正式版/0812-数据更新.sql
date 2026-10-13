UPDATE `xswc_finance_assistant`.`fa_sales_order_stock_out` SET `deleted` = 1 WHERE `id` = 242;
UPDATE `xswc_finance_assistant`.`fa_sales_order` SET  `purchase_price` = 1079.85, `quantity` = 500, `sales_price` = 1079.85, `sales_quantity` = 500 WHERE `id` = 274;

UPDATE `xswc_finance_assistant`.`fa_sales_order_stock_out` SET  `sales_order_code` = 'hw260509200-1' WHERE `id` = 228;
UPDATE `xswc_finance_assistant`.`fa_sales_order_stock_out` SET  `sales_order_code` = 'hw2605121400-1' WHERE `id` = 229;
UPDATE `xswc_finance_assistant`.`fa_sales_order_stock_out` SET  `sales_order_code` = 'hw260512300-2' WHERE `id` = 230;
UPDATE `xswc_finance_assistant`.`fa_sales_order_stock_out` SET  `sales_order_code` = 'hw2605141000-1' WHERE `id` = 231;
UPDATE `xswc_finance_assistant`.`fa_sales_order_stock_out` SET  `sales_order_code` = 'hw2605142000-2' WHERE `id` = 232;
UPDATE `xswc_finance_assistant`.`fa_sales_order_stock_out` SET  `sales_order_code` = 'hw260517500-1' WHERE `id` = 233;


UPDATE `xswc_finance_assistant`.`fa_sales_order_stock_out` SET `deleted` = 1 WHERE sales_order_code in ('BL0708-001',	'BL0708-002',	'BL0708-003',	'BL0708-004',	'BL0708-005',	'BL0708-006',	'BL0708-007',	'BL0708-008',	'BL0708-009',	'BL0708-010',	'BL0708-011',	'BL0708-012',	'BL0708-013',	'BL0708-014',	'BL0708-015',	'BL0708-016',	'BL0708-017',	'BL0708-018',	'BL0708-019',	'BL0708-022',	'BL0708-023',	'BL0712-023',	'BL0712-024',	'BL0712-025',	'BL0712-026',	'BL0712-027',	'BL0712-028',	'BL0712-029',	'BL0712-030',	'BL0712-031',	'BL0712-032',	'BL0712-033',	'BL0712-034',	'BL0712-035',	'BL0712-036',	'BL0712-037',	'BL0712-038',	'BL0712-039',	'BL0712-040');


UPDATE `xswc_finance_assistant`.`fa_activity_info` SET  `deleted` = 1 WHERE `id` = 200;
UPDATE `xswc_finance_assistant`.`fa_purchase_order_stock_in` SET  `deleted` = 1 WHERE `id` = 185;

-- 修改
UPDATE `xswc_finance_assistant`.`fa_sales_order_stock_out` SET  `order_code` = '8eca942803ae0f7' WHERE `id` = 336;
UPDATE `xswc_finance_assistant`.`fa_sales_order_stock_out` SET  `order_code` = '8ed472a003af03b' WHERE `id` = 398;
UPDATE `xswc_finance_assistant`.`fa_sales_order_stock_out` SET  `order_code` = '8ef920f003b0935' WHERE `id` = 394;
UPDATE `xswc_finance_assistant`.`fa_sales_order_stock_out` SET  `order_code` = '8fa6d8f803cd82b' WHERE `id` = 378;
UPDATE `xswc_finance_assistant`.`fa_sales_order_stock_out` SET  `order_code` = '8cf6b068037cdac' WHERE `id` = 225;

UPDATE `xswc_finance_assistant`.`fa_sales_order` SET  `order_code` = '8eca942803ae0f7' WHERE `id` = 272;
UPDATE `xswc_finance_assistant`.`fa_sales_order` SET  `order_code` = '8ed472a003af03b' WHERE `id` = 353;
UPDATE `xswc_finance_assistant`.`fa_sales_order` SET  `order_code` = '8ef920f003b0935' WHERE `id` = 349;
UPDATE `xswc_finance_assistant`.`fa_sales_order` SET  `order_code` = '8fa6d8f803cd82b' WHERE `id` = 341;
UPDATE `xswc_finance_assistant`.`fa_sales_order` SET  `order_code` = '8cf6b068037cdac' WHERE `id` = 172;
UPDATE `xswc_finance_assistant`.`fa_sales_order` SET  `order_code` = '9025785000bb1ac-1' WHERE `id` = 62;
UPDATE `xswc_finance_assistant`.`fa_sales_order` SET  `order_code` = '90843d0000bb55f-1' WHERE `id` = 75;
UPDATE `xswc_finance_assistant`.`fa_sales_order` SET  `order_code` = '920a81a800c992d-1' WHERE `id` = 268;



UPDATE `xswc_finance_assistant`.`fa_sales_order_stock_out` SET `deleted` = 1 WHERE `id` in (258,259,260,261);
UPDATE `xswc_finance_assistant`.`fa_sales_order` SET  `sales_order_code` = '9025785000bb1ac-1', `stock_out_completed` = 0 WHERE `id` = 196;
UPDATE `xswc_finance_assistant`.`fa_sales_order` SET  `sales_order_code` = '90843d0000bb55f-1', `stock_out_completed` = 0 WHERE `id` = 209;
UPDATE `xswc_finance_assistant`.`fa_sales_order` SET  `sales_order_code` = '920a81a800c992d-1', `stock_out_completed` = 0 WHERE `id` = 264;

UPDATE `xswc_finance_assistant`.`fa_sales_order_stock_out` SET  `order_code` = '8ed47aa003af8a0',`sales_order_code` = '9025785800bb023-1' WHERE `id` = 46;

UPDATE `xswc_finance_assistant`.`fa_sales_order_stock_out` SET `agreement_no` = 'DCXY202606040016', `order_code` = '8ede418803b000d' WHERE `id` = 337;
UPDATE `xswc_finance_assistant`.`fa_sales_order_stock_out` SET `agreement_no` = 'DCXY202607693194', `order_code` = '8f4e3ed003c1de9' WHERE `id` = 247;


UPDATE `xswc_finance_assistant`.`fa_sales_order_stock_out` SET  `sales_demand_code` = null, `sales_order_code` = '8ef9d41800b78f6', `erp_original_order_id` = '8ef9d41800b78f6-1', `stock_out_quantity` = 400, `deleted` = 0 WHERE `id` = 128;

UPDATE `xswc_finance_assistant`.`fa_purchase_order_stock_in` SET  `stock_in_quantity` = 35 WHERE `id` = 80;
UPDATE `xswc_finance_assistant`.`fa_purchase_order_stock_in` SET  `deleted` = 1 WHERE `id` = 81;


UPDATE `xswc_finance_assistant`.`fa_sales_order_stock_out` SET  `stock_out_quantity` = 300 WHERE `id` = 335;
UPDATE `xswc_finance_assistant`.`fa_sales_order_stock_out` SET  `stock_out_quantity` = 40 WHERE `id` = 134;
UPDATE `xswc_finance_assistant`.`fa_sales_order_stock_out` SET  `stock_out_quantity` = 20 WHERE `id` = 15;
UPDATE `xswc_finance_assistant`.`fa_sales_order_stock_out` SET  `stock_out_quantity` = 300 WHERE `id` = 112;
INSERT INTO `xswc_finance_assistant`.`fa_sales_order_stock_out` ( `agreement_no`, `order_code`, `sales_demand_code`, `sales_order_code`, `stock_out_id`, `wms_co_id`, `erp_original_order_id`, `stock_out_date`, `warehouse_name`, `common_code`, `common_name`, `stock_out_quantity`, `deleted`, `create_by`, `create_time`, `update_by`, `update_time`) VALUES ( 'DCXY202606040019', '8ef920f003b0935', 'XQ0703-005', 'hw260703500-2', 48835588, 14810893, 'hw260703500', '2026-07-03 17:49:57', '醒市无仓-郑州货押大仓', 'XS24BPA22002265001', '华为擎云 C5e(第2代) BZH5-W00', 200, 0, 23385, '2026-07-15 17:46:24', 23385, '2026-07-15 17:46:24');
INSERT INTO `xswc_finance_assistant`.`fa_sales_order_stock_out` ( `agreement_no`, `order_code`, `sales_demand_code`, `sales_order_code`, `stock_out_id`, `wms_co_id`, `erp_original_order_id`, `stock_out_date`, `warehouse_name`, `common_code`, `common_name`, `stock_out_quantity`, `deleted`, `create_by`, `create_time`, `update_by`, `update_time`) VALUES ( 'DCXY202606040020', '8f4274b803bf47e', '8f1abb0003b9563', '90843d0000bb55f', 37426374, 14810894, '90843d0000bb55f', '2026-05-05 15:56:45', '醒市无仓-深圳货押仓', 'XS235DA2400220S001', 'iPhone 17 Pro', 100, 0, 23385, '2026-06-18 14:43:59', 23385, '2026-06-18 14:43:59');
INSERT INTO `xswc_finance_assistant`.`fa_sales_order_stock_out` ( `agreement_no`, `order_code`, `sales_demand_code`, `sales_order_code`, `stock_out_id`, `wms_co_id`, `erp_original_order_id`, `stock_out_date`, `warehouse_name`, `common_code`, `common_name`, `stock_out_quantity`, `deleted`, `create_by`, `create_time`, `update_by`, `update_time`) VALUES ( 'DCXY202606040020', '8f4274b803bf47f', '8f1abb0003b9564', '9025785000bb1ac', 36192207, 14810894, '9025785000bb1ac', '2026-04-23 18:05:29', '醒市无仓-深圳货押仓', 'XS235DA2400220S004', 'iPhone 17 Pro', 60, 0, 23385, '2026-06-18 14:43:59', 23385, '2026-06-18 14:43:59');
INSERT INTO `xswc_finance_assistant`.`fa_sales_order_stock_out` ( `agreement_no`, `order_code`, `sales_demand_code`, `sales_order_code`, `stock_out_id`, `wms_co_id`, `erp_original_order_id`, `stock_out_date`, `warehouse_name`, `common_code`, `common_name`, `stock_out_quantity`, `deleted`, `create_by`, `create_time`, `update_by`, `update_time`) VALUES ( 'DCXY202606040020', '8f4274b803bf480', '8f1abb0003b9565', '920a81a800c992d', 43626920, 14810894, '920a81a800c992d', '2026-06-08 16:24:29', '醒市无仓-深圳货押仓', 'XS235DA2400220S007', 'iPhone 17 Pro', 180, 0, 23385, '2026-06-18 14:43:59', 23385, '2026-06-18 14:43:59');



UPDATE `xswc_finance_assistant`.`fa_purchase_agreement_order` SET  `unit_price` = 1053.00, `quantity` = 1200, `total_price` = 1263600.00, `picked_quantity` = 1200, `unpicked_quantity` = 0, `stock_in_quantity` = 1200 WHERE `id` = 132;
UPDATE `xswc_finance_assistant`.`fa_purchase_agreement_order` SET  `unit_price` = 1203.00, `quantity` = 1400, `total_price` = 1684200.00,  `picked_quantity` = 1400, `sync_status` = 2, `stock_in_quantity` = 1400 WHERE `id` = 131;
UPDATE `xswc_finance_assistant`.`fa_purchase_agreement` SET  `agent_purchase_amount` = 4422600.00, `deposit_amount` = 884520.00,`agreement_status` = 6  WHERE `id` = 15;
UPDATE `xswc_finance_assistant`.`fa_purchase_agreement_detail` SET  `price` = 1053.00, `quantity` = 1200 WHERE `id` = 131;
UPDATE `xswc_finance_assistant`.`fa_purchase_agreement_detail` SET  `price` = 1203.00, `quantity` = 1200 WHERE `id` = 132;

UPDATE `xswc_finance_assistant`.`fa_purchase_agreement` SET  `agreement_status` = 6 WHERE `id` in (21,12);