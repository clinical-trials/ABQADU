const { defaultTerms, normalizeTerms } = require('./preconstructionAgreement');

// Adapted from the owner-supplied letter agreement. Client names and the
// source property are deliberately excluded from the reusable preset.
function getPreconstructionTemplate({ demo = false } = {}) {
  const terms = normalizeTerms({
    ...defaultTerms(),
    owner_name: demo ? 'Demo homeowner' : '',
    property_address: demo ? 'Demo property — Albuquerque, NM' : '',
    contractor_name: demo ? 'Fifth Element Construction' : '',
    project_description: 'Planning and coordination for the proposed construction of one accessory dwelling unit (ADU). The proposed construction contract and final project scope remain to be agreed.',
    scope: `PURPOSE AND INTERIM WORK
The owner identified in this packet ("Owner") is obtaining a fixed fee proposal ("Proposed Contract") from the contractor identified in this packet ("Contractor") for the project described above ("Project"). While negotiating the Proposed Contract, the parties intend this letter agreement ("Agreement") to authorize an initial phase of preconstruction activities ("Interim Work") to preserve time and expedite the schedule.

Contractor shall have the opportunity to present the Proposed Contract, but may not be chosen as the contractor for the Project. Owner may undertake a formal bidding process if the parties cannot agree on a fixed fee.

This Agreement is intended to authorize Contractor to engage subcontractors, vendors and/or consultants, and to consult with Owner and designers or engineers to begin planning and preparing the Project. Interim Work includes planning and coordination for one ADU. Confirm specific deliverables, revisions and responsible professionals before executing the final agreement.

LATER CONSTRUCTION AGREEMENT
If the Proposed Contract is finalized and executed, this Agreement shall automatically be superseded by the Proposed Contract. All services and obligations under this Agreement shall be incorporated within and controlled for all purposes by the Proposed Contract.

SITE-INSPECTION ACKNOWLEDGMENT AND WAIVER - SOURCE CLAUSE FOR REVIEW
Contractor acknowledges that it has inspected the site and information provided. Contractor shall make no claim for conditions which Contractor reasonably should have discovered or become aware of through a reasonable investigation of the site or a reasonable examination of information provided by Owner and hereby waives any such claim.
This proposed clause is not a record that a site inspection has occurred. Confirm the facts and review this language before client use.`,
    schedule: `Contractor shall perform and carry out the Interim Work in a professional, satisfactory and timely manner. Confirm the start date, milestones, deliverables and completion target in the final agreement; the source letter does not specify dates.`,
    exclusions: `INTERIM WORK LIMIT - SOURCE CLAUSE FOR REVIEW
Contractor agrees and understands that the Interim Work contemplated under this Agreement shall not include any activity that would give rise to a lien under NMSA 1978, Section 48-2-2. Contractor shall not allow subcontractors to perform any action on or related to the Project site that would give rise to a lien under that section.

The source letter describes planning and coordination, not a construction authorization. Specific exclusions and responsibility for surveys, stamped design, engineering, permit fees and utility work must be confirmed in the final reviewed scope. The cited provision and proposed contractual restriction require review for the actual services.`,
    payment_terms: 'The entire preconstruction fee stated in this packet is payable upon execution of the final signed preconstruction agreement. This demo or draft is not an executed agreement or issued invoice, and no payment is due from it.',
    termination_terms: `Either party may terminate this Agreement, with or without cause, upon seven (7) days' prior written notice to the other party. In the event of termination, Contractor shall immediately stop all work and services under this Agreement and deliver to Owner copies of all data, drawings, reports, estimates, summaries and other information and materials accumulated in performing this Agreement, whether completed or in process.

If the parties are unable to negotiate and execute the Proposed Contract and this Agreement is terminated, upon receipt of Owner's written request Contractor will assign to Owner all rights and obligations of subcontracts, purchase orders or related agreements executed pursuant to this Agreement. Owner will hold Contractor harmless for the obligations under such contracts up to the total sum.

Final review must define the referenced "total sum" and any accounting or refund terms; those amounts and procedures are not specified in the source letter. Applicable cancellation rights and required notices remain subject to separate review.`,
    third_party_costs: `COMPLIANCE, SUBCONTRACTORS AND LIABILITY - SOURCE TERMS FOR REVIEW
Contractor and its subcontractors shall comply with all applicable building laws, regulations, decrees, codes, ordinances, resolutions and other acts of governmental authority, including applicable federal and state labor, employment, tax and safety laws during performance of the Agreement.

Contractor shall promptly pay all sums due to subcontractors and other persons in connection with performance of its obligations and take all necessary actions to prevent recording a claim of lien upon the site and/or against Owner by such persons.

Contractor will indemnify and hold Owner harmless for damages or injuries caused by Contractor's negligence or fault in performing services under this Agreement, or that of Contractor's employees, agents or subcontractors. All services or work shall comply with applicable laws and regulations and be performed by persons properly licensed for that work.

Confirm authorization limits and who pays for third-party services and expenses; the source letter does not itemize these costs.`,
    estimate_assumptions: 'The source agreement does not set a construction price. A fixed fee construction proposal remains to be negotiated and separately executed. The preliminary construction amount, inclusions, exclusions and assumptions require project-specific review.',
    notice_details: 'Adapted from the supplied preconstruction letter for demonstration. Review contractor identity and license, the site-inspection acknowledgment and waiver, lien restriction, liability language, seven-day termination, subcontract assignment, the undefined "total sum", refund/accounting terms and applicable notices. Owner/property details in demo mode are samples. Tax treatment, fee credit and notice applicability remain unconfirmed. No forms, inspection, signature or payment are completed by loading this template.',
  });
  return { template_id: 'letter-agreement-v1', label: 'Preconstruction letter agreement', terms };
}

module.exports = { getPreconstructionTemplate };
