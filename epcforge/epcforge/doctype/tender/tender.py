# Copyright (c) 2026, Invento Software Limited and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class Tender(Document):
	def autoname(self):
		from frappe.model.naming import make_autoname

		series = frappe.db.get_single_value("EPCForge Settings", "tender_naming_series") or self.naming_series
		self.name = make_autoname(series, doc=self)

	def before_insert(self):
		from epcforge.epcforge.doctype.epcforge_settings.epcforge_settings import EPCForgeSettings

		get = EPCForgeSettings.get_default
		if not self.tender_type:
			self.tender_type = get("default_tender_type")
		if not self.procurement_method:
			self.procurement_method = get("default_procurement_method")
		if not self.project:
			self.project = get("default_project")

	def validate(self):
		self.apply_default_bid_bond()

	def apply_default_bid_bond(self):
		if self.bid_bond_amount or not self.estimated_value:
			return
		pct = frappe.db.get_single_value("EPCForge Settings", "default_bid_bond_pct")
		if pct:
			self.bid_bond_amount = flt(self.estimated_value) * flt(pct) / 100.0

	def before_save(self):
		self.update_bidder_counts()

	def before_submit(self):
		if self.status not in ("Published", "Under Evaluation", "Awarded"):
			self.status = "Published"

	def on_submit(self):
		self.notify_invited_bidders()

	def before_cancel(self):
		self.status = "Cancelled"

	def notify_invited_bidders(self):
		from epcforge.epcforge.doctype.epcforge_settings.epcforge_settings import send_epc_notification

		recipients = [
			frappe.db.get_value("Supplier", row.supplier, "email_id")
			for row in self.invited_bidders
			if row.supplier
		]
		recipients = [r for r in recipients if r]
		if not recipients:
			return
		send_epc_notification(
			subject=_("Tender Published: {0}").format(self.tender_title or self.name),
			message=_(
				"You are invited to bid on tender <b>{0}</b>.<br>"
				"Submission deadline: {1}<br>"
				"Estimated value: {2}"
			).format(
				self.tender_title or self.name,
				frappe.utils.format_datetime(self.submission_deadline) if self.submission_deadline else "-",
				self.estimated_value or "-",
			),
			recipients=recipients,
		)

	def update_bidder_counts(self):
		"""Update bidder counts from the child table"""
		total = 0
		submitted = 0

		for bidder in self.invited_bidders:
			total += 1
			if bidder.bid_status == "Quotation Submitted":
				submitted += 1
			if bidder.bid_status == "Awarded":
				self.awarded_to = bidder.supplier
				self.award_amount = bidder.bid_amount

		self.bidder_count = total
		self.quotes_received = submitted

		# Find lowest bidder
		lowest_amount = None
		lowest_supplier = None
		for bidder in self.invited_bidders:
			if bidder.bid_amount and bidder.bid_amount > 0:
				if lowest_amount is None or bidder.bid_amount < lowest_amount:
					lowest_amount = bidder.bid_amount
					lowest_supplier = bidder.supplier

		if lowest_supplier:
			self.lowest_bidder = lowest_supplier
			self.lowest_bid_amount = lowest_amount
