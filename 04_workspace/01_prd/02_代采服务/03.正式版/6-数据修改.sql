-- 保证金管理创建人修改
UPDATE `xswc_finance_assistant`.`fa_deposit_manage` SET  `create_by` = 386864, `update_by` = 386864 ;

-- 采购协议创建人修改
UPDATE `xswc_finance_assistant`.`fa_purchase_agreement` SET `create_by` = 386864, `update_by` = 386864 ;

-- 采购协议明细创建人修改
UPDATE `xswc_finance_assistant`.`fa_purchase_agreement_detail` SET `create_by` = 386864, `update_by` = 386864 ;

-- 采购订单创建人修改
UPDATE `xswc_finance_assistant`.`fa_purchase_agreement_order` SET `create_by` = 386864, `update_by` = 386864 ;

-- 分销创建人修改
UPDATE `xswc_finance_assistant`.`fa_sales_order` SET `create_by` = 386864, `update_by` = 386864 ;

-- 代储申请订单创建人修改
UPDATE `xswc_finance_assistant`.`fa_storage_agency_apply` SET `create_by` = 386864, `update_by` = 386864 WHERE create_time = '2026-06-04 00:00:00' ;

-- 代储申请明细创建人修改
UPDATE `xswc_finance_assistant`.`fa_storage_agency_apply_item` SET `create_by` = 386864, `update_by` = 386864 ;

-- 代储订单创建人修改
UPDATE `xswc_finance_assistant`.`fa_storage_order` SET `create_by` = 386864, `update_by` = 386864 ;

-- 代储发布创建人修改
UPDATE `xswc_finance_assistant`.`fa_storage_order_publish` SET `create_by` = 386864, `update_by` = 386864 ;

-- 代储结算创建人修改
UPDATE `xswc_finance_assistant`.`fa_storage_settlement` SET `create_by` = 386864, `update_by` = 386864 ;

-- 代储电子仓单创建人修改
UPDATE `xswc_finance_assistant`.`fa_storage_warehouse_receipt` SET `create_by` = 386864, `update_by` = 386864 ;


-- 下单人修改
UPDATE `xswc_finance_assistant`.`fa_purchase_agreement_order` SET  `order_create_id` = 386864 WHERE order_create_name = '于瑛琪';