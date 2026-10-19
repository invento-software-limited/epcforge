# Copyright (c) 2026, Invento Software Limited and contributors
# For license information, please see license.txt

import frappe
from frappe import _

from epcforge import report_kit as kit
from epcforge.utils import ignore_active_project


def execute(filters=None):
	columns = get_columns()
	# The report has its own Project filter; the sidebar's active-project list scope does not apply.
	with ignore_active_project():
		data = get_data(filters)
	return columns, data, get_meta(filters, data)


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
	filters = filters or {}
	list_filters = {k: filters.get(k) for k in ("project", "status") if filters.get(k)}
	data = frappe.get_list("BOQ", filters=list_filters, order_by="creation desc", limit_page_length=0,
		fields=["name", "project", "contract_type", "status", "docstatus", "total_amount", "estimated_cost",
			"actual_cost", "budget_variance", "gross_margin_pct", "revision"])
	counts = {}
	for parent in frappe.get_all("BOQ Item", filters={"parent": ["in", [r.name for r in data] or [""]]}, pluck="parent"):
		counts[parent] = counts.get(parent, 0) + 1
	for row in data:
		row["item_count"] = counts.get(row.name, 0)
	return data


def get_meta(filters, data):
	"""Header cards and charts from the table's rows; cancelled BOQs are left out of totals."""
	live = [r for r in data if r.get("docstatus") != 2]
	contract = kit.total(live, lambda r: r.total_amount)
	estimated = kit.total(live, lambda r: r.estimated_cost)
	return kit.meta(
		boqs=len(live),
		cancelled=len(data) - len(live),
		contract=contract,
		estimated=estimated,
		actual=kit.total(live, lambda r: r.actual_cost),
		margin_pct=kit.pct(contract - estimated, contract),
		statuses=kit.group(live, lambda r: r.status, lambda r: r.total_amount),
		per_boq=[{"name": r.name, "project": r.project, "contract": r.total_amount, "estimated": r.estimated_cost,
			"actual": r.actual_cost, "margin_pct": r.gross_margin_pct} for r in sorted(live, key=lambda r: -(r.total_amount or 0))[:12]],
	)
