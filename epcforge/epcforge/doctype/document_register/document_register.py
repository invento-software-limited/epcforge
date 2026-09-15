# Copyright (c) 2026, Invento Software Limited and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class DocumentRegister(Document):
	def autoname(self):
		from frappe.model.naming import make_autoname

		series = (
			frappe.db.get_single_value("EPCForge Settings", "document_naming_series") or self.naming_series
		)
		self.name = make_autoname(series, doc=self)

	def before_insert(self):
		if not self.project:
			self.project = frappe.db.get_single_value("EPCForge Settings", "default_project")

	def before_submit(self):
		if self.status == "Draft":
			self.status = "Under Review"

	def on_submit(self):
		self.notify_recipient()

	def before_cancel(self):
		self.status = "Cancelled"

	def notify_recipient(self):
		from epcforge.epcforge.doctype.epcforge_settings.epcforge_settings import send_epc_notification

		if not self.recipient:
			return
		email = frappe.db.get_value("Supplier", self.recipient, "email_id")
		if not email:
			return
		send_epc_notification(
			subject=_("Document Transmitted: {0}").format(self.document_title or self.name),
			message=_(
				"A document has been transmitted to you.<br>Title: {0}<br>Type: {1}<br>Revision: {2}"
			).format(self.document_title or self.name, self.document_type or "-", self.revision or 0),
			recipients=[email],
		)
