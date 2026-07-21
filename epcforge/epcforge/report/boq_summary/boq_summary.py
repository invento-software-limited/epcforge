# Copyright (c) 2026, Invento Software Limited and contributors
# For license information, please see license.txt

import frappe
from frappe import _


def execute(filters=None):
	columns = get_columns()
	data = get_data(filters)
	return columns, data


def get_columns():
	return [
		{"label": _("BOQ"), "fieldname": "name", "fieldtype": "Link", "options": "BOQ", "width": 180},
		{
			"label": _("Project"),
			"fieldname": "project",
			"fieldtype": "Link",
			"options": "Project",
			"width": 180,
		},
		{"label": _("Contract Type"), "fieldname": "contract_type", "fieldtype": "Data", "width": 120},
		{"label": _("Status"), "fieldname": "status", "fieldtype": "Data", "width": 100},
		{"label": _("Items"), "fieldname": "item_count", "fieldtype": "Int", "width": 80},
		{"label": _("Total Amount"), "fieldname": "total_amount", "fieldtype": "Currency", "width": 140},
		{"label": _("Estimated Cost"), "fieldname": "estimated_cost", "fieldtype": "Currency", "width": 140},
		{"label": _("Margin %"), "fieldname": "gross_margin_pct", "fieldtype": "Percent", "width": 100},
		{"label": _("Revision"), "fieldname": "revision", "fieldtype": "Int", "width": 80},
	]


def get_data(filters):
	boq = frappe.qb.DocType("BOQ")

	query = (
		frappe.qb.from_(boq)
		.select(
			boq.name,
			boq.project,
			boq.contract_type,
			boq.status,
			boq.total_amount,
			boq.estimated_cost,
			boq.actual_cost,
			boq.budget_variance,
			boq.gross_margin_pct,
			boq.revision,
		)
		.orderby(boq.creation, order=frappe.qb.desc)
	)

	if filters and filters.get("project"):
		query = query.where(boq.project == filters.get("project"))
	if filters and filters.get("status"):
		query = query.where(boq.status == filters.get("status"))

	data = query.run(as_dict=True)

	for row in data:
		row["item_count"] = frappe.db.count("BOQ Item", {"parent": row["name"]})

	return data
