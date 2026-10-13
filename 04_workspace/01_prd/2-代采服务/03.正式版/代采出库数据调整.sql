-- ============================================================================
-- 指定6张采购单：入库数量 vs 出库数量 差异修正
-- ============================================================================
-- 说明：出库表中"同一销售单+同编码+同数量"被重复登记了2次，导致出库虚高。
-- 修正方式：删除完全重复的多余记录（保留1条）。
-- 执行前请备份 stock_out 表！
-- ============================================================================

-- ========================= 可确定修正（重复出库） =========================

-- ① 采购单 8b53b8400358c2e（华为擎云 65001）→ 销售单 8ef9d41800b78f6
--    出库 id=128 与 id=129 完全相同(编码XS24BPA22002265001, 各400)，多计400
DELETE FROM stock_out WHERE id = 129;   -- 保留id=128

-- ② 采购单 8f4274b803bf47e（iPhone17 S001）→ 销售单 90843d0000bb55f
--    出库 id=134(40) 与 id=413(100) 为同一销售单两次登记，但数量不同，
--    无法直接判重，需人工确认是"分批出库"还是"误录"（40+100=140，销售表该单销量=0）。

-- ③ 其余采购单（851b5bf8023ac6b / 851b6d80023a818 / 87c5d7f002c0781 / 8a5d9500032d958）
--    出库均为单条记录、无重复，差异来自【采购单与销售单并非严格一一对应】，
--    见下方差异清单说明，无SQL可删。

-- ============================================================================
-- 附：全表重复出库修正（id较大者为多余重复，删除后出库总量减少6,463件）
-- ============================================================================
/*
DELETE FROM stock_out WHERE id = 129;  -- 8ef9d41800b78f6   XS24BPA22002265001 400
DELETE FROM stock_out WHERE id = 422;  -- 94d7bb8000de4f8-1 XS24BPA22002265002 500
DELETE FROM stock_out WHERE id = 423;  -- 94d7bb8000de4f9-1 XS24BPA22002265001 500
DELETE FROM stock_out WHERE id = 384;  -- RY260602400-1   XS235DA230024K4001 400
DELETE FROM stock_out WHERE id = 385;  -- RY260604130-1   XS235DA230024K4001 130
DELETE FROM stock_out WHERE id = 373;  -- RY260604270-2   XS235DA230024K4003 270
DELETE FROM stock_out WHERE id = 389;  -- RY260609260     XS235DA230024K4003 260
DELETE FROM stock_out WHERE id = 387;  -- hw060510-10    XS235DA2200231D005 10
DELETE FROM stock_out WHERE id = 388;  -- hw060510-2     N99801080E03000107 10
DELETE FROM stock_out WHERE id = 358;  -- hw060530-1     N99801080E03000105 30
DELETE FROM stock_out WHERE id = 359;  -- hw06056-9      N99801080E03000107 6
DELETE FROM stock_out WHERE id = 376;  -- hw06057-3      N99801080E03000103 7
DELETE FROM stock_out WHERE id = 393;  -- hw060820-1     N99801080E03001F01 20
DELETE FROM stock_out WHERE id = 324;  -- hw2605141000-1 N003020B0K03ZZXO04 1000
DELETE FROM stock_out WHERE id = 329;  -- hw2605142000-2 N003020B0K03ZZXO01 2000
DELETE FROM stock_out WHERE id = 400;  -- hw260517400-3 N003020B0K03ZZXO01 400
DELETE FROM stock_out WHERE id = 325;  -- hw260517500-1 N003020B0K03ZZXO04 500
DELETE FROM stock_out WHERE id = 382;  -- hw26052510-2  XS24A7A2200224M001 10
DELETE FROM stock_out WHERE id = 386;  -- hw26060410-1  N003020B0K03ZZZO06 10
*/
-- ============================================================================
