# Copyright (c) 2026, Invento Software Limited and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.mapper import get_mapped_doc
from frappe.utils import flt


class BOQ(Document):
	def autoname(self):
		from frappe.model.naming import make_autoname

		series = frappe.db.get_single_value("EPCForge Settings", "boq_naming_series") or self.naming_series
		self.name = make_autoname(series, doc=self)

	def before_insert(self):
		from epcforge.epcforge.doctype.epcforge_settings.epcforge_settings import EPCForgeSettings

		get = EPCForgeSettings.get_default
		if not self.contract_type:
			self.contract_type = get("default_contract_type") or "Lump Sum"
		if not self.retention_pct:
			self.retention_pct = get("retention_default_pct")
		if not self.project:
			self.project = get("default_project")

	def before_save(self):
		self.run_calculations()

	def before_update_after_submit(self):
		# Frappe routes saves on an already-submitted doc through this hook instead
		# of validate/before_save, so the same recompute pipeline has to run here too.
		self.run_calculations()

	def run_calculations(self):
		self.validate_project_uniqueness()
		self.validate_qc_before_completion()
		self.populate_payment_schedule_from_milestones()
		self.calculate_item_amounts()
		self.calculate_totals()
		self.calculate_payment_schedule()

	def before_submit(self):
		if self.status != "Draft":
			frappe.throw(_("Only Draft BOQ can be submitted"))
		self.status = "Submitted"
		self.revision = (self.revision or 0) + 1

	def before_cancel(self):
		self.status = "Cancelled"

	def on_submit(self):
		self.db_set("status", "Approved")
		self.create_project_budget_if_not_exists()

	def validate_project_uniqueness(self):
		existing_boq = frappe.db.exists(
			"BOQ",
			{
				"project": self.project,
				"name": ["!=", self.name or ""],
				"docstatus": ["!=", 2],
			},
		)
		if existing_boq:
			frappe.throw(
				_("An active BOQ ({0}) already exists for Project {1}.").format(existing_boq, self.project)
			)

	def validate_qc_before_completion(self):
		for item in self.get("boq_items"):
			if item.percent_complete and item.percent_complete > 80:
				qc_exists = frappe.db.exists(
					"Quality Inspection", {"custom_boq_item": item.name, "status": "Accepted"}
				)
				if not qc_exists:
					frappe.throw(
						_(
							"Row {0}: cannot exceed 80% completion without an accepted Quality Inspection"
						).format(item.idx)
					)

	def populate_payment_schedule_from_milestones(self, force=False):
		"""Append a row for any billing-milestone Task not already represented.
		Safe to call on every save: matching is by linked_wbs, so it never
		duplicates a row or touches manually-added milestone rows.
		"""
		if not self.project:
			return
		if force:
			self.set("boq_payment_schedule", [])

		existing = {d.linked_wbs for d in self.get("boq_payment_schedule") if d.linked_wbs}
		for ms in get_billing_milestones(self.project):
			if ms.name not in existing:
				self.append(
					"boq_payment_schedule",
					{
						"linked_wbs": ms.name,
						"milestone": ms.subject,
						"percent_amount": flt(ms.epc_billing_weightage),
						"target_date": ms.exp_end_date,
						"payment_status": "Pending",
					},
				)

	def calculate_item_amounts(self):
		"""Calculate amount = qty * rate for each BOQ item; autofill Material rows."""
		for item in self.boq_items:
			if item.item_type == "Material" and item.boq_code:
				self._autofill_from_item_master(item)

			qty = flt(item.qty)
			rate = flt(item.rate)
			if qty < 0 or rate < 0:
				frappe.throw(_("Quantity and Rate must be non-negative (row {0}).").format(item.idx))
			item.amount = qty * rate

	def _autofill_from_item_master(self, item):
		if not item.description or not item.uom:
			details = frappe.db.get_value(
				"Item", item.boq_code, ["description", "item_name", "stock_uom"], as_dict=True
			)
			if details:
				item.description = item.description or details.description or details.item_name
				item.uom = item.uom or details.stock_uom
		if not item.preferred_vendor:
			item.preferred_vendor = frappe.db.get_value(
				"Item Supplier", {"parent": item.boq_code}, "supplier"
			)
		if not flt(item.rate):
			price = frappe.db.get_value(
				"Item Price", {"item_code": item.boq_code, "price_list": "Standard Buying"}, "price_list_rate"
			)
			if price:
				item.rate = price

	def calculate_totals(self):
		"""Roll up total amount, actual cost, margin, and budget variance."""
		total_amount = 0.0
		total_estimated = 0.0
		total_actual = 0.0

		for item in self.boq_items:
			if item.item_type == "Material" and item.boq_code and item.name:
				item.actual_cost = self._calculate_item_actual_cost(item)

			total_amount += item.amount or 0
			total_estimated += item.estimated_cost or 0
			total_actual += item.actual_cost or 0

			cost_to_use = flt(item.actual_cost) if flt(item.actual_cost) > 0 else flt(item.estimated_cost)
			item.margin_pct = (
				((flt(item.amount) - cost_to_use) / flt(item.amount) * 100) if item.amount else 0
			)

		self.total_amount = total_amount
		self.estimated_cost = total_estimated
		self.actual_cost = total_actual

		if total_amount > 0:
			self.gross_margin_pct = ((total_amount - total_estimated) / total_amount) * 100
		else:
			self.gross_margin_pct = 0

		self.budget_variance = total_estimated - total_actual

	def _calculate_item_actual_cost(self, item):
		pr_val = (
			frappe.db.sql(
				"""
				select coalesce(sum(pri.amount), 0)
				from `tabPurchase Receipt Item` pri
				join `tabPurchase Receipt` pr on pr.name = pri.parent
				where pri.custom_boq_item = %s and pr.docstatus = 1
				""",
				item.name,
			)[0][0]
			or 0.0
		)
		se_val = (
			frappe.db.sql(
				"""
				select coalesce(sum(sed.amount), 0)
				from `tabStock Entry Detail` sed
				join `tabStock Entry` se on se.name = sed.parent
				where sed.custom_boq_item = %s and se.docstatus = 1
				""",
				item.name,
			)[0][0]
			or 0.0
		)
		pi_val = (
			frappe.db.sql(
				"""
				select coalesce(sum(pii.amount), 0)
				from `tabPurchase Invoice Item` pii
				join `tabPurchase Invoice` pi on pi.name = pii.parent
				where pii.custom_boq_item = %s and pi.docstatus = 1
				and (pii.purchase_receipt is null or pii.purchase_receipt = '')
				""",
				item.name,
			)[0][0]
			or 0.0
		)
		return flt(pr_val) + flt(se_val) + flt(pi_val)

	def calculate_payment_schedule(self):
		for row in self.get("boq_payment_schedule"):
			gross = (flt(row.percent_amount) / 100.0) * flt(self.total_amount)
			row.amount = gross
			row.advance_deduction = gross * flt(self.advance_pct) / 100.0
			row.retention_amount = gross * flt(self.retention_pct) / 100.0
			row.net_payable = gross - flt(row.advance_deduction) - flt(row.retention_amount)

	def create_project_budget_if_not_exists(self):
		"""Auto-create a Project Budget when BOQ is submitted"""
		if not frappe.db.exists("Project Budget", {"project": self.project}):
			budget = frappe.new_doc("Project Budget")
			budget.project = self.project
			budget.project_name = self.project_name
			budget.boq = self.name
			budget.contract_value = self.total_amount
			budget.approved_budget = self.estimated_cost
			budget.insert()


@frappe.whitelist()
def get_boq_summary(boq_name):
	"""Return summary data for the BOQ dashboard"""
	boq = frappe.get_doc("BOQ", boq_name)
	return {
		"total_amount": boq.total_amount,
		"estimated_cost": boq.estimated_cost,
		"actual_cost": boq.actual_cost,
		"budget_variance": boq.budget_variance,
		"gross_margin_pct": boq.gross_margin_pct,
		"item_count": len(boq.boq_items),
		"status": boq.status,
		"revision": boq.revision,
	}


@frappe.whitelist()
def get_boq_items_by_group(boq_name):
	"""Return BOQ items grouped for tree display"""
	boq = frappe.get_doc("BOQ", boq_name)
	items = []
	for item in boq.boq_items:
		items.append(
			{
				"boq_code": item.boq_code,
				"description": item.description,
				"group": item.group,
				"qty": item.qty,
				"uom": item.uom,
				"rate": item.rate,
				"amount": item.amount,
				"estimated_cost": item.estimated_cost,
				"item_type": item.item_type,
				"phase": item.phase,
			}
		)
	return items


@frappe.whitelist()
def get_billing_milestones(project):
	"""Fetch billing-milestone Tasks from the project schedule."""
	if not project:
		return []
	return frappe.get_all(
		"Task",
		filters={
			"project": project,
			"custom_is_billing_milestone": 1,
			"docstatus": ["!=", 2],
		},
		fields=["name", "subject", "epc_billing_weightage", "exp_end_date"],
	)


@frappe.whitelist()
def create_material_request(source_name, target_doc=None):
	"""Create a Material Request from BOQ using get_mapped_doc.
	Maps only Material-type rows with a stock Item.
	"""

	def post_process(source, target):
		target.material_request_type = "Purchase"
		target.set_warehouse = frappe.db.get_single_value("Stock Settings", "default_warehouse")
		target.custom_boq = source.name
		if not target.company:
			target.company = frappe.db.get_single_value("EPCForge Settings", "default_company")

		target.items = [
			item
			for item in target.items
			if item.item_code and frappe.db.get_value("Item", item.item_code, "is_stock_item")
		]
		if not target.items:
			frappe.throw(_("No items with 'is_stock_item' enabled were found in this BOQ."))

	return get_mapped_doc(
		"BOQ",
		source_name,
		{
			"BOQ": {
				"doctype": "Material Request",
				"field_map": {"project": "project", "name": "custom_boq"},
				"field_no_map": ["status", "naming_series"],
			},
			"BOQ Item": {
				"doctype": "Material Request Item",
				"field_map": {
					"boq_code": "item_code",
					"description": "item_name",
					"qty": "qty",
					"uom": "uom",
					"rate": "rate",
					"name": "custom_boq_item",
				},
				"condition": lambda d: d.item_type == "Material" and d.boq_code,
			},
		},
		target_doc=target_doc,
		postprocess=post_process,
	)


@frappe.whitelist()
def create_sales_invoice(source_name, milestone_row_name):
	boq = frappe.get_doc("BOQ", source_name)
	row = next((r for r in boq.get("boq_payment_schedule") if r.name == milestone_row_name), None)
	if not row:
		frappe.throw(_("Selected Milestone not found."))
	if row.sales_invoice:
		frappe.throw(_("Milestone is already invoiced under {0}.").format(row.sales_invoice))

	customer = frappe.db.get_value("Project", boq.project, "customer")

	def postprocess(source, target):
		if customer:
			target.customer = customer
		target.project = boq.project
		target.epc_linked_milestone = row.linked_wbs
		if not target.company:
			target.company = frappe.db.get_single_value("EPCForge Settings", "default_company")

		income_account = frappe.db.get_value(
			"Account", {"company": target.company, "root_type": "Income", "is_group": 0}, "name"
		)
		# Bill the gross milestone amount - retention is deducted exactly once,
		# via the invoice's own epc_retention_* fields (see budget_hooks.on_sales_invoice_validate).
		# BOQ Payment Schedule's net_payable/advance_deduction stay planning-only figures;
		# using net_payable here would double-deduct retention on top of itself.
		target.append(
			"items",
			{
				"item_name": row.milestone or _("Progress Billing"),
				"qty": 1,
				"rate": row.amount,
				"amount": row.amount,
				"income_account": income_account,
				"description": _("Progress Billing for {0} ({1}% of Contract Value)").format(
					row.milestone, row.percent_amount
				),
			},
		)

	return get_mapped_doc(
		"BOQ",
		source_name,
		{
			"BOQ": {
				"doctype": "Sales Invoice",
				"field_map": {"project": "project"},
				"field_no_map": ["status", "naming_series"],
			}
		},
		postprocess=postprocess,
	)


@frappe.whitelist()
def get_boq_dashboard_data(boq_name):
	"""Procurement, costing, and payment data for the BOQ form's in-document
	Dashboard tab. Reuses the same aggregations as the Project Dashboard page
	so the two views never drift apart.
	"""
	from epcforge.epcforge.page.project_dashboard.project_dashboard import (
		_cost_by_item_type,
		_payment_milestones,
		_procurement_coverage,
	)

	boq = frappe.get_doc("BOQ", boq_name)
	return {
		"currency": frappe.db.get_single_value("EPCForge Settings", "default_currency")
		or frappe.defaults.get_global_default("currency"),
		"costing": {
			"contract_value": flt(boq.total_amount),
			"estimated_cost": flt(boq.estimated_cost),
			"actual_cost": flt(boq.actual_cost),
			"gross_margin_pct": flt(boq.gross_margin_pct),
			"budget_variance": flt(boq.budget_variance),
		},
		"procurement": _procurement_coverage(boq),
		"item_type_costs": _cost_by_item_type(boq),
		"payment": _payment_milestones(boq),
	}


@frappe.whitelist()
def get_linked_boq_item(task_name):
	"""Return the stock BOQ Item row linked to this Task, if any."""
	row = frappe.db.get_value(
		"BOQ Item",
		{"linked_wbs": task_name, "item_type": "Material"},
		["name", "boq_code", "description", "qty", "uom", "rate", "parent"],
		as_dict=True,
	)
	if not row or not row.boq_code:
		return None
	return row if frappe.db.get_value("Item", row.boq_code, "is_stock_item") else None


@frappe.whitelist()
def create_mr_from_task(source_name, target_doc=None):
	"""Create a Material Request from the single BOQ Item linked to this Task."""
	row = get_linked_boq_item(source_name)
	if not row:
		frappe.throw(_("No stock BOQ Item is linked to this Task."))

	project = frappe.db.get_value("BOQ", row.parent, "project")

	mr = frappe.new_doc("Material Request")
	mr.material_request_type = "Purchase"
	mr.project = project
	mr.custom_boq = row.parent
	mr.set_warehouse = frappe.db.get_single_value("Stock Settings", "default_warehouse")
	mr.append(
		"items",
		{
			"item_code": row.boq_code,
			"item_name": row.description,
			"qty": row.qty,
			"uom": row.uom,
			"rate": row.rate,
			"custom_boq_item": row.name,
		},
	)
	return mr
