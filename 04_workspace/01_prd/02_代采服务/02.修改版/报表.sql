SELECT
    t_ag.all_agent_purchase_amount        AS 协议代采总额,
    t_po.all_purchase_total_price        AS 采购总额,
    t_po.all_stock_in_amount             AS 入库总额,
    t_act.all_activity_amount            AS 发布活动总额,
    t_sale.all_sales_amount_by_po_price  AS 销售订单总额_按采购订单单价计算
FROM
(
    SELECT COALESCE(SUM(agent_purchase_amount), 0.00) AS all_agent_purchase_amount
    FROM fa_purchase_agreement
    WHERE deleted = 0
) t_ag,

(
    SELECT
        COALESCE(SUM(total_price), 0.00) AS all_purchase_total_price,
        COALESCE(SUM(stock_in_quantity * unit_price), 0.00) AS all_stock_in_amount
    FROM fa_purchase_agreement_order
    WHERE deleted = 0
) t_po,

(
    SELECT COALESCE(SUM(quantity * purchase_price), 0.00) AS all_activity_amount
    FROM fa_activity_info
    WHERE deleted = 0
) t_act,

(
    SELECT
        COALESCE(SUM(so.sales_quantity * po.unit_price), 0.00) AS all_sales_amount_by_po_price
    FROM fa_sales_order so
    LEFT JOIN fa_purchase_agreement_order po
        ON so.order_code = po.order_code
        AND po.deleted = 0
    WHERE so.deleted = 0
) t_sale;