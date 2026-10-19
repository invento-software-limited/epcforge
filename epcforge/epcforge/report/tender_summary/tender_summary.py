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
		{
			"fieldname": "tender_name",
			"label": _("Tender"),
			"fieldtype": "Link",
			"options": "Tender",
			"width": 200,
		},
		{
			"fieldname": "project",
			"label": _("Project"),
			"fieldtype": "Link",
			"options": "Project",
			"width": 150,
		},
		{
			"fieldname": "tender_type",
			"label": _("Type"),
			"fieldtype": "Data",
			"width": 100,
		},
		{
			"fieldname": "status",
			"label": _("Status"),
			"fieldtype": "Data",
			"width": 120,
		},
		{
			"fieldname": "scope_of_work",
			"label": _("Scope of Work"),
			"fieldtype": "Small Text",
			"width": 200,
		},
		{
			"fieldname": "number_of_bidders",
			"label": _("No. of Bidders"),
			"fieldtype": "Int",
			"width": 120,
		},
		{
			"fieldname": "submission_deadline",
			"label": _("Submission Deadline"),
			"fieldtype": "Datetime",
			"width": 150,
		},
		{
			"fieldname": "evaluation_notes",
			"label": _("Evaluation Summary"),
			"fieldtype": "Small Text",
			"width": 200,
		},
		{
			"fieldname": "awarded_to",
			"label": _("Awarded To"),
			"fieldtype": "Link",
			"options": "Supplier",
			"width": 150,
		},
		{
			"fieldname": "award_amount",
			"label": _("Award Amount"),
			"fieldtype": "Currency",
			"width": 120,
		},
	]


def get_data(filters):
	filters = filters or {}
	list_filters = [[k, "=", filters.get(k)] for k in ("project", "tender_type", "status") if filters.get(k)]
	# The filters are labelled "Publish Date"; they used to filter the submission deadline.
	if filters.get("from_date"):
		list_filters.append(["publish_date", ">=", filters.get("from_date")])
	if filters.get("to_date"):
		list_filters.append(["publish_date", "<=", filters.get("to_date")])
	data = frappe.get_list("Tender", filters=list_filters, order_by="submission_deadline desc", limit_page_length=0,
		fields=["name as tender_name", "project", "tender_type", "status", "docstatus", "scope_of_work", "submission_deadline",
			"evaluation_notes", "awarded_to", "award_amount", "estimated_value", "publish_date"])
	bidders = {}
	for parent in frappe.get_all("Tender Bidder", filters={"parent": ["in", [r.tender_name for r in data] or [""]]}, pluck="parent"):
		bidders[parent] = bidders.get(parent, 0) + 1
	for row in data:
		row["number_of_bidders"] = bidders.get(row.tender_name, 0)
	return data


def get_meta(filters, data):
	"""Header cards and charts from the table's rows; cancelled tenders are left out of totals."""
	live = [r for r in data if r.get("docstatus") != 2 and r.get("status") != "Cancelled"]
	awarded = [r for r in live if r.status == "Awarded"]
	estimated_awarded = kit.total(awarded, lambda r: r.estimated_value)
	award_value = kit.total(awarded, lambda r: r.award_amount)
	return kit.meta(
		tenders=len(live),
		open=len([r for r in live if r.status in ("Published", "Under Evaluation")]),
		bidders=kit.total(live, lambda r: r.number_of_bidders),
		bidders_per_tender=[{"name": r.tender_name, "bidders": r.number_of_bidders} for r in live],
		estimated=kit.total(live, lambda r: r.estimated_value),
		awarded_count=len(awarded),
		award_value=award_value,
		awarded_estimate=estimated_awarded,
		award_vs_estimate_pct=kit.pct(award_value, estimated_awarded),
		statuses=kit.group(live, lambda r: r.status, lambda r: r.estimated_value),
		types=kit.group(live, lambda r: r.tender_type, lambda r: r.estimated_value),
	)
