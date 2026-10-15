"""Pre-Joining Briefing for Senior Officers — form OF-MA-010, Revision 1
(16-Aug-25). Items are transcribed verbatim from the paper form; `key`s are
stable identifiers stored with the answers, so don't renumber existing items.
"""

FORM_NO = "OF-MA-010"
REVISION = "1"
REVISION_DATE = "16-Aug-25"
TITLE = "PRE-JOINING BRIEFING FOR SENIOR OFFICERS"
INTRO = ("All senior officers are to be briefed on the following points. "
         "Additional comments may be recorded on the page provided at the end.")
CONFIRMATION = ("I hereby confirm that I have been briefed on the above-mentioned "
                "subject to my satisfaction.")

DEPARTMENTS = ("qhse", "marine", "technical", "manning_it_accounts")

DEPARTMENT_LABELS = {
    "qhse": "QHSE",
    "marine": "MARINE",
    "technical": "TECHNICAL",
    "manning_it_accounts": "MANNING / IT / ACCOUNTS",
}

SECTIONS = {
    "qhse": [
        ("q01", "Introduction to Ozellar"),
        ("q02", "Vision, Mission, Values"),
        ("q03", "Policies - QHSE, D&A, Security, H&B"),
        ("q04", "S.A.I.L safety program, Safety culture, Personal Safety"),
        ("q05", "DPA, Alt DPA"),
        ("q06", "Detailed presentation on key points from procedures"),
        ("q07", "Risk assessment -RA explanation"),
        ("q08", "Permits to work System"),
        ("q09", "Incident investigation"),
        ("q10", "Safety officer – Presentation (for Ch off and 2nd Eng)"),
        ("q11", "Management of change"),
        ("q12", "Daily work planning meeting, Safety meetings, SMS review"),
        ("q13", "MARPOL Amendments, New Regulations, Others Environment Regulations, "
                "OPA, VGP, EU, CARB, ECA, SEEMP, EEOI, Other Energy Efficiency Measures"),
        ("q14", "Importance of reporting – Near Miss, SAIL Card, Best Practice"),
        ("q15", "Important regulations – new / upcoming"),
        ("q16", "Contingency Drills and Emergency Preparedness"),
        ("q17", "Pollution prevention  – Oil Ballast, Garbage, Air, Sewage"),
        ("q18", "Recent Incidents, Fleet alerts on External inspections, Circulars, "
                "Manager's Instruction, Safety Bulletins, New Regulations"),
        ("q19", "Understanding of MLC convention requirements"),
    ],
    "marine": [
        ("m01", "Roles and Responsibilities,  For Masters - Master's overriding authority"),
        ("m02", "Ship's Particulars, Trading areas, Constraints, Any particular constraints "
                "on the vessel with respect to cargo / navigation / ship handling, Voyage "
                "specific hazards / concerns, Any special requirements like (ICE Class "
                "Vessels, Freezing Conditions etc.), Environmental Sensitive areas"),
        ("m03", "Charter party, Flow of Owner to Charterer (Including Sub Charterers), "
                "Voy orders, NOR, Speed and vessel performance, Fuel / R.O. B declaration."),
        ("m04", "Cargo related - lashing, contamination, recent"),
        ("m05", "Crew complaint procedure (use of complaint form) / Copy of onboard "
                "complaint form available with seafarer"),
        ("m06", "Overview of audit process –Navigation Audit, Internal Audit., Managing NC, "
                "Implementation of CA, Any outstanding NC / Observations. Next intermediate "
                "/ Renewal Audit. Preventive and Corrective Action"),
        ("m07", "SIRE inspections, Rightship inspections"),
        ("m08", "Importance of gangway watch, first impression"),
        ("m09", "Security procedures on board"),
        ("m10", "Fatigue – Rest Hour requirements"),
        ("m11", "Navigation Watch Keeping - Distractions, Use of mobile phones"),
        ("m12", "Safe Navigation – UKC Policy, Minimum watch schedule, Position plotting "
                "intervals, Navigation with Pilots, Chart correction, Weather routeing, "
                "ECDIS, T & P in ECDIS"),
        ("m13", "Mooring Safety, cargo watch at Port, Cargo Lashings – Cargo Manual"),
        ("m14", "Main Engine Emergency maneuver from bridge-Training for Navigating officers"),
        ("m15", "PSC/FLAG INSPECTIONS – NEW FOCUS AREA, Repeated observations"),
    ],
    "technical": [
        ("t01", "Critical / Potential problems of the particular vessel, possible "
                "corrective / preventive measures. VIR status / 3rd party deficiencies,"),
        ("t02", "Requisition status. Month end reports."),
        ("t03", "Lube oil analysis interval and AE Lube oil renewal criteria."),
        ("t04", "Importance of standby equipment, change over schedule"),
        ("t05", "Reporting of defects, breakdowns"),
        ("t06", "Critical equipment and critical spares"),
        ("t07", "Fuel oil analysis, Purification"),
        ("t08", "Engine room watch keeping, Watch levels"),
        ("t09", "Bunkering Operations"),
        ("t10", "Purchase procedures"),
        ("t11", "Reporting formats - Requisition status, Month end reports. Understand "
                "the importance of accuracy of these parameters."),
        ("t12", "Importance of regular morning meetings and daily planning meetings; "
                "Daily Work Planer"),
        ("t13", "ME overload – not to overload ME above 80% of MCR. In case of adverse "
                "weather condition reduce ME RPM and to inform office the reason for not "
                "meeting CP requirement."),
        ("t14", "Deck machinery (esp. Windlass and Accommodation ladder) care and "
                "maintenance, past experience"),
        ("t15", "Importance of ensuring all gauges / instrumentation working in good order."),
        ("t16", "Familiarization with MariApps module"),
    ],
    "manning_it_accounts": [
        ("a01", "Cyber Security & Shipboard IT Hardware/Software -  It & OT Risk Register, "
                "Number/Location of computers onboard ships, User Management and Password "
                "Management, Use of personal portable media devices, Virus control"),
        ("a02", "Shipboard IT Hardware, software, asset management, communication system"),
        ("a03", "Health, Hygiene, and cleanliness on board, Family carriage Policy. "
                "CTM – request submitting and arrangements, ITF, Visitor's policy, CBA, "
                "War risk allowance"),
        ("a04", "On board training, Cadet training, Promotion Orientation program"),
        ("a05", "CTM, Crew pay roll"),
    ],
}

RESPONSES = ("yes", "no", "na")


def section_items(department):
    return [{"key": k, "text": t} for k, t in SECTIONS[department]]


def template_payload():
    return [{"department": d, "label": DEPARTMENT_LABELS[d], "items": section_items(d)}
            for d in DEPARTMENTS]
