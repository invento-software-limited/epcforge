# EPCForge

**EPCForge** is a Frappe app that delivers end-to-end Engineering, Procurement, and Construction (EPC) management within Frappe/ERPNext. It provides structured Bill of Quantities (BOQ), project budgeting, tender management, and engineering document control in a unified interface.

---

## Target Audience

- **Project Managers** who need complete oversight over project budgets, tenders, and engineering deliverables.
- **Estimation Engineers** who build and maintain complex, hierarchical Bill of Quantities (BOQ) with margin analysis.
- **Procurement Officers** who issue tenders, collect vendor bids, and track bidder evaluations.
- **Document Control Specialists** who manage engineering drawings, specifications, RFIs, submittals, and revision workflows.

---

## Key Features

### 🎯 BOQ (Bill of Quantities) Engine
Tree-structured BOQ management with multi-level sections and items.
- Section and item hierarchy with automated rate and total calculations
- Quantity × Rate calculations with configurable margin percentages
- Revision tracking (`amended_from`) for clear audit history
- Payment schedule linked to BOQ project milestones

### 💾 Project Budget & Cost Control
Budget planning and variance analysis linked directly to BOQ items.
- Line-item budget tracking linked to custom cost heads
- Target vs. Actual tracking with auto-calculated variance
- Dedicated committed, actual spent, and remaining balance columns
- Financial threshold alerts to avoid budget overruns

### 🔌 Tender & Bid Management
Streamlined tender lifecycle management from issue to contract award.
- Full tender states: Draft → Open → Under Evaluation → Awarded → Cancelled
- Tender classifications: Open, Selective, Negotiated, Single Source
- Bidder invitation tracking, bid comparisons, and evaluation summaries
- Integrated **Tender Summary Report** for pipeline insights

### ⚡ Engineering Document Register
Centralized document control for all project engineering assets.
- Classification by document type (Drawings, Specifications, RFIs, Submittals, NCRs)
- Revision tracking and version control
- Multi-party assignment across Clients, Consultants, Contractors, and Vendors
- Workflow states: Draft → Under Review → Approved → Rejected → Issued

---

## Roadmap

- **Subcontractor Portal** — External bidding and progress claim portal for subcontractors
- **AI-Assisted BOQ Import** — Automatic extraction of BOQ items from PDF/Excel tenders
- **Earned Value Management (EVM)** — Integrated CPI, SPI, and S-Curve reporting

---

## Tech Highlights

- Built for **Frappe v14+ / v15+ / v16+** and **ERPNext v14+ / v15+ / v16+**
- Native integration with standard ERPNext **Project**, **Task**, and **Supplier** doctypes
- Responsive Desk views with custom action dropdowns on Project forms
- Open source under the **MIT License**

---

## About Invento Software Limited

Invento Software Limited builds enterprise-grade Frappe and ERPNext applications tailored for construction, engineering, manufacturing, and supply chain enterprises.

- **Website:** [invento.com.bd](https://invento.com.bd)
- **Email:** [hello@invento.com.bd](mailto:hello@invento.com.bd)
- **GitHub:** [invento-dev](https://github.com/invento-dev)
