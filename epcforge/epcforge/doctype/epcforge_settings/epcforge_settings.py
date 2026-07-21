import frappe
from frappe import _
from frappe.model.document import Document


class EPCForgeSettings(Document):
	"""EPCForge global settings — app-wide defaults and configuration."""

	def validate(self):
		self.validate_email_settings()

	def validate_email_settings(self):
		if self.enable_email_notifications and not self.notification_sender_email:
			frappe.msgprint(
				_("Email notifications are enabled but no sender email is set."),
				alert=True,
			)

	@staticmethod
	def get_default(name):
		"""Convenience helper to get a setting value or None."""
		return frappe.db.get_single_value("EPCForge Settings", name)
