"""One-off content seed: creates the "Engine Cadet Test — Version 2 (from
PDF, answered)" screening test with all 75 questions, correct answers, and
the Q32 figure-transformation image, by calling the running API.

This is content data (not schema), so it isn't carried by `git pull` or a
migration — run this once against whichever backend you want the test to
appear in (local dev or production).

Usage (from the backend/ directory, with the venv active):

    # against your local dev server (default http://localhost:8000)
    ./.venv/Scripts/python.exe seed_engine_cadet_test.py

    # against production
    ./.venv/Scripts/python.exe seed_engine_cadet_test.py --base-url https://training.ozellar.com

Safe to re-run: if a test with this exact title already exists, it skips
creating a duplicate and exits without changing anything.
"""
import argparse
import io
import json
import os
import sys
import urllib.error
import urllib.request

# Windows consoles default to a codepage that can't print the em dash in
# TEST_TITLE; force UTF-8 stdout so status lines don't get mangled.
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
IMAGE_PATH = os.path.join(SCRIPT_DIR, "seed_assets", "q32-figure-transformation.jpeg")
IMAGE_STORAGE_NAMESPACE = "screening-questions"
IMAGE_STORAGE_FILENAME = "q32-figure-transformation.jpeg"

TEST_TITLE = "Engine Cadet Test — Version 2 (from PDF, answered)"

COMPREHENSION_1_PASSAGE = (
    "Despite being surrounded by vast oceans, ships operate within the constraints "
    "of finite resources and fragile ecosystems. Modern maritime operations demand "
    "not only technical precision but also environmental foresight. Crew members "
    "must now be as familiar with ballast water treatment systems as with radar "
    "controls. The International Maritime Organization's increasing regulations "
    "reflect a shift in priorities—from economic efficiency to environmental "
    "sustainability. Yet, the success of these initiatives hinges not solely on "
    "institutional frameworks but on the awareness and conduct of individuals "
    "aboard. A single lapse in waste segregation or an overlooked oily bilge "
    "discharge can nullify months of compliance efforts. Thus, while technology "
    "advances, the human factor remains irreplaceable. Ultimately, the true "
    "compass guiding a vessel toward sustainable operations is not only "
    "mechanical but moral."
)

COMPREHENSION_2_PASSAGE = (
    "Life at sea requires discipline, teamwork, and attention to detail. Every "
    "crew member has a specific duty to ensure the ship functions smoothly and "
    "safely. The galley staff, for example, must prepare meals not only on time "
    "but also in a hygienic environment. Cleanliness in the kitchen is essential "
    "because food-borne illnesses can spread quickly on board. This is why "
    "regular cleaning, proper storage, and correct food handling are strictly "
    "followed. The cooperation of all departments helps the ship maintain high "
    "standards of safety and health. Even during rough weather or emergencies, "
    "responsibilities must be met. Discipline and routine are what keep the ship "
    "running like a well-oiled machine."
)

SECTIONS = [
    {
        "title": "Comprehension — Passage 1",
        "passage": COMPREHENSION_1_PASSAGE,
        "questions": [
            {"prompt": "What is the main message conveyed by the passage?", "options": ["The shift toward environmentally responsible maritime operations", "The economic burden of IMO regulations", "The inefficiency of modern ship designs", "The evolution of navigation technologies on ships"], "answer": 0},
            {"prompt": "According to the passage, which factor is described as irreplaceable for achieving environmental compliance on ships?", "options": ["Institutional policies", "Automated systems", "Advanced equipment", "Crew conduct and awareness"], "answer": 3},
            {"prompt": "What does the phrase 'nullify months of compliance efforts' suggest in the context of the passage?", "options": ["A single mistake can undo long-standing adherence", "Compliance records can be forged easily", "Mechanical systems usually override human error", "Environmental compliance is not legally binding"], "answer": 0},
            {"prompt": "Which statement best reflects the author's tone in the final sentence?", "options": ["Ironic and sarcastic", "Technical and clinical", "Philosophical and reflective", "Angry and accusatory"], "answer": 2},
            {"prompt": "Which of the following is not explicitly mentioned as part of crew responsibilities?", "options": ["Waste segregation", "Radar operations", "Bilge discharge management", "Cargo loading optimization"], "answer": 3},
        ],
    },
    {
        "title": "Comprehension — Passage 2",
        "passage": COMPREHENSION_2_PASSAGE,
        "questions": [
            {"prompt": "According to the passage, what is a key duty of the galley staff on board a ship?", "options": ["Ensuring meals are prepared hygienically and on schedule", "Managing cargo loading operations", "Supervising deck maintenance routines", "Conducting safety drills for the crew"], "answer": 0},
            {"prompt": "Why is maintaining a hygienic galley environment crucial on a ship?", "options": ["To reduce noise levels in the galley", "To enforce discipline among the kitchen staff", "To avoid unnecessary food wastage", "To prevent the spread of illness among crew members"], "answer": 3},
            {"prompt": "Which factor is most important for ensuring the ship consistently upholds high standards of safety and health?", "options": ["New equipment", "Weekly safety drills", "Crew cooperation", "More storage space"], "answer": 2},
            {"prompt": "Which option most accurately captures the author's attitude in the passage?", "options": ["Lighthearted and humorous", "Supportive and disciplined", "Sarcastic and dismissive", "Critical and pessimistic"], "answer": 1},
            {"prompt": "During periods of rough weather at sea, what does the passage emphasize as essential for maintaining ship operations?", "options": ["Continued fulfillment of responsibilities", "Relaxation of safety standards", "Suspension of all duties", "Immediate return to port"], "answer": 0},
        ],
    },
    {
        "title": "English Aptitude",
        "passage": None,
        "questions": [
            {"prompt": "Which of the following sentences demonstrates correct parallel structure?", "options": ["The engineer checked the fuel levels, cleaned the filters, and replaced the pump.", "The engineer has checked fuel levels, cleaned filters, and pump was replaced.", "The engineer checks fuel levels, filter cleaning, and replaced the pump.", "The engineer checked the fuel levels, cleaned the filters, and was replacing the pump."], "answer": 0},
            {"prompt": "Select the most precise word to complete the sentence: \"The engineer's instructions were so _____ that the crew completed the repairs without confusion.\"", "options": ["vague", "ambiguous", "explicit", "contradictory"], "answer": 2},
            {"prompt": "Which of the following sentences uses the third conditional correctly?", "options": ["If he follows the checklist, the error would have avoided.", "If he had followed the checklist, the error would have been avoided.", "If he would have followed the checklist, the error would be avoided.", "If he had follow the checklist, the error would had avoided."], "answer": 1},
            {"prompt": 'Which of the following words is closest in meaning to "alleviate"?', "options": ["To ignore completely", "To increase intensity", "To analyze carefully", "To make less severe"], "answer": 3},
            {"prompt": "Which sentence below uses correct subject-verb agreement?", "options": ["Neither the pumps nor the generator is functioning.", "Neither the officers nor the cadet are responsible.", "The chief along with the officers were on duty.", "Each of the reports contain errors."], "answer": 0},
        ],
    },
    {
        "title": "Numerical Aptitude",
        "passage": None,
        "questions": [
            {"prompt": "Find the next number in the sequence: 3, 6, 12, 24, ?", "options": ["54", "36", "30", "48"], "answer": 3},
            {"prompt": "A ship covers a distance of 180 nautical miles in 9 hours. What is its average speed?", "options": ["15 knots", "16 knots", "20 knots", "18 knots"], "answer": 2},
            {"prompt": "A tower is 100 meters tall. From two boats anchored on opposite sides of the tower, the angles of elevation to the top are 30° and 45° respectively. What is the distance between the two boats?", "options": ["200 m", "273 m", "173 m", "300 m"], "answer": 1},
            {"prompt": "A cylindrical iron pipe is 21 cm long with an external diameter of 8 cm and a wall thickness of 1 cm. If the density of iron is 8 g/cm³, what is the mass of the pipe?", "options": ["3.6 kg", "36 kg", "3.696 kg", "36.9 kg"], "answer": 2},
            {"prompt": "If the ratio of the angles in a triangle is 3:4:5, what is the value of the largest angle?", "options": ["75°", "90°", "80°", "100°"], "answer": 0},
            {"prompt": "Insert the missing number in the sequence: 12, 15, 31, 63, 127, 255, (....)", "options": ["517", "513", "523", "511"], "answer": 3},
            {
                "prompt": "Which set of figures best illustrates the transformation where closed shapes gradually open up and open shapes gradually close?",
                "options": ["Option 1", "Option 2", "Option 3", "Option 4"], "answer": 0,
                "imageUrls": [f"/api/uploads/{IMAGE_STORAGE_NAMESPACE}/{IMAGE_STORAGE_FILENAME}"],
            },
            {"prompt": "A boat travels 90 nautical miles against the current and then returns with the current to its starting point. If the speed against the current is 12 knots and with the current is 18 knots, what is the total time required for the entire journey?", "options": ["12 hours", "10 hours", "9 hours", "11 hours"], "answer": 0},
            {"prompt": "A team of 5 workers can finish a job in 24 days. If only 3 workers are assigned to the same job, how many days will they need to complete it at the same pace?", "options": ["36 days", "30 days", "18 days", "40 days"], "answer": 3},
            {"prompt": "Given that the average weight of A, B, and C is 45 kg, the average of A and B is 40 kg, and the average of B and C is 43 kg, calculate the weight of B.", "options": ["17 kg", "31 kg", "20 kg", "26 kg"], "answer": 1},
        ],
    },
    {
        "title": "Pre-Sea Training & Class 12",
        "passage": None,
        "questions": [
            {"prompt": "Which of the following best describes why contactors are preferred over relays for switching large electrical loads on ships?", "options": ["Contactors are designed to switch higher current loads than relays.", "Relays and contactors have identical load capacities.", "Contactors are only used for low power signaling.", "Relays are always used for high voltage circuits."], "answer": 0},
            {"prompt": "Which type of pump is most frequently used for transferring lubricating oil aboard ships?", "options": ["Screw pump", "Reciprocating pump", "Gear pump", "Centrifugal pump"], "answer": 2},
            {"prompt": "Which statement accurately applies to all three-phase alternators?", "options": ["They always deliver power through three sets of slip rings and brushes.", "They use three separate rotating magnetic systems acting on a single armature winding.", "They contain three identical armature windings, each influenced by a single rotating magnetic field.", "All are built to function exclusively at a 0.8 leading power factor."], "answer": 2},
            {"prompt": "What is the primary purpose of an intercooler in a multi-stage air compressor?", "options": ["To cool the air between compression stages and reduce the work required for further compression", "To regulate the speed of the compressor motor", "To increase the final discharge pressure of the compressor", "To filter out moisture from the compressed air"], "answer": 0},
            {"prompt": "Which method is recommended for safely cleaning delicate electrical contact surfaces on shipboard equipment?", "options": ["Use a magnetic brush to remove dust from all electrical contacts.", "Use a soft brush and an approved safety solvent to clean delicate parts.", "Apply grease to the contact surfaces to improve conductivity.", "Blow metallic dust away using compressed air directly onto the contacts."], "answer": 1},
            {"prompt": "In a two-stroke electronically controlled marine engine such as the MAN B&W ME-C, what is the primary role of the exhaust valve?", "options": ["To relieve excess pressure during the compression stroke", "To inject fuel into the combustion chamber", "To introduce fresh air into the cylinder during scavenging", "To permit the escape of burnt gases from the cylinder after combustion"], "answer": 3},
            {"prompt": "Why is it important for AC generators operating in parallel to maintain the same power factor?", "options": ["To ensure the generators run at different frequencies.", "To minimize circulating currents between generators.", "To maximize the voltage output of each generator.", "To increase the total fuel consumption."], "answer": 1},
            {"prompt": "Which statement correctly distinguishes a 2-stroke marine diesel engine from a 4-stroke marine diesel engine?", "options": ["A 2-stroke engine completes a power stroke every two revolutions", "A 2-stroke engine has a separate exhaust and intake stroke", "A 2-stroke engine always operates at a lower RPM than a 4-stroke", "A 2-stroke engine produces a power stroke with every crankshaft revolution"], "answer": 3},
            {"prompt": "In a crosshead-type two-stroke marine engine, what is the primary role of the crosshead bearing?", "options": ["It transmits the linear force from the piston rod to the connecting rod while absorbing side thrust.", "It regulates the fuel injection timing.", "It supports the rotation of the camshaft.", "It drives the scavenge pump directly."], "answer": 0},
            {"prompt": "What is the main function of a uniflow scavenging system in a two-stroke marine engine?", "options": ["To ensure fresh air enters from one end and exhaust gases exit from the other", "To enhance the mixing of air and fuel before combustion", "To reduce the engine's rotational speed (RPM)", "To improve lubricating oil distribution throughout the cylinder"], "answer": 0},
            {"prompt": "What is the primary role of a capacitor in the starting circuit of a single-phase induction motor?", "options": ["To decrease the phase angle between windings", "To extend the lifespan of starting contacts", "To reduce radio frequency interference", "To split the phase and create a rotating magnetic field"], "answer": 3},
            {"prompt": "What are the potential effects of improper fuel injection timing in a two-stroke marine engine?", "options": ["Significantly increased lubrication requirements", "No impact, as timing is not critical in two-stroke engines", "Only a reduction in engine vibration", "Elevated exhaust temperatures and engine knocking may occur"], "answer": 3},
            {"prompt": "Which condition must be satisfied for two alternators to operate successfully in parallel?", "options": ["Both alternators must have the same frequency (cycles per second).", "The alternators must always share load equally regardless of rating.", "The alternators must have different numbers of field poles.", "Both alternators must have identical voltage regulators."], "answer": 0},
            {"prompt": "When an AC motor rated at 25 horsepower is started, by how much will the generator panel's kilowatt (kW) meter reading increase, assuming 1 HP = 0.746 kW and neglecting losses?", "options": ["18.65 kW", "30.65 kW", "37.65 kW", "25.65 kW"], "answer": 0},
            {"prompt": "Under what circumstance is the emergency bilge suction valve most appropriately operated on a ship?", "options": ["To inject cleaning chemicals into the bilge system", "When the bilges are flooded and cannot be pumped out by normal means", "To supply extra cooling water to the main condenser", "To connect the rose box to the main sea suction"], "answer": 1},
            {"prompt": "Which test is specifically designed to measure a metal's ability to absorb energy from a sudden impact load?", "options": ["Brinell only", "Charpy and Brinell", "Charpy only", "Rockwell and Brinell"], "answer": 2},
            {"prompt": "Which component in a diesel engine is responsible for converting the reciprocating motion of the piston into rotational motion for the crankshaft?", "options": ["Connecting rod", "Flywheel", "Cylinder liner", "Camshaft"], "answer": 0},
            {"prompt": "Which document is mandatory under the IMO Data Collection System (DCS) requirement of MARPOL Annex VI, Regulation 27?", "options": ["Oil Record Book Part II", "SEEMP Part II", "Cargo Record Book", "Energy Audit Certificate"], "answer": 1},
            {"prompt": "What is the main function of an unloading device in an air compressor?", "options": ["To remove water from the air receiver", "To drain water from the compressor cylinders", "To delay compression until the motor reaches operating speed", "To check the alignment of the pump"], "answer": 2},
            {"prompt": "Which statement best describes the behavior of an oil with a high viscosity index when subjected to temperature changes?", "options": ["Its viscosity decreases sharply with minor temperature changes.", "Its viscosity increases rapidly as temperature rises.", "Its viscosity remains completely constant regardless of temperature.", "Its viscosity changes very little even with significant temperature variations."], "answer": 3},
            {"prompt": "What is the correct term for the pressure measured at the inlet side of a pump?", "options": ["Discharge head", "Pump head", "Suction head", "Static head"], "answer": 2},
            {"prompt": "Which of the following is a likely reason for water droplets being carried over with the distillate in a freshwater generator's vacuum chamber?", "options": ["Excessive vacuum in the chamber", "High feedwater salinity", "Malfunctioning demister unit", "Low seawater flow to condenser"], "answer": 2},
            {"prompt": "In a centrifugal purifier, what is the primary function of the gravity disc?", "options": ["It controls the feed pump pressure", "It adjusts the bowl speed", "It separates oil from air", "It determines the interface position between oil and water"], "answer": 3},
            {"prompt": "Which situation is most likely to cause hunting in an automatic boiler pressure control system in the engine room?", "options": ["Accurate tuning of the controller's PID parameters", "Consistent and stable fuel supply", "Maintaining a high water level in the boiler drum", "A rapid fluctuation in steam consumption"], "answer": 3},
            {"prompt": "What is the primary function of flux when soldering electrical joints?", "options": ["To prevent the solder from sticking", "To clean the joint area before soldering", "To increase the strength of the solder", "To lower the melting point of the solder"], "answer": 1},
            {"prompt": "Why is an interlock incorporated into the main engine starting air system on ships?", "options": ["To maintain constant scavenge air pressure", "To protect the engine from over-speeding", "To inject fuel during low-speed operation", "To prevent engine start when the turning gear is engaged"], "answer": 3},
            {"prompt": "What is the primary reason for monitoring the temperature of the scavenge space in large low-speed two-stroke marine engines?", "options": ["It ensures the turbocharger is functioning efficiently", "A significant increase may signal a scavenge fire or piston ring blow-by", "It is used to verify fuel injection timing", "It is necessary for piston cooling"], "answer": 1},
            {"prompt": "Which statement best defines energy in scientific terms?", "options": ["Energy is the ability to do work or cause change.", "Energy is the rate at which power is used.", "Energy is the process of transferring heat.", "Energy is the amount of force applied over time."], "answer": 0},
            {"prompt": "Which statement most accurately defines 'sensitivity' in the context of controller action?", "options": ["The time delay between an input and the resulting output.", "The amount of manipulated variable altered by the control mode.", "The difference between the set point and the actual controlled variable.", "The ratio of the output change to the input change that caused it."], "answer": 3},
            {"prompt": "Which statement best characterizes a closed loop control system in automation?", "options": ["Feed forward is the only method used in closed loop systems.", "The controller takes corrective action only after detecting a deviation in the controlled variable from its set point.", "Manual intervention by the operator is always required for adjustments.", "The system operates solely based on preset input signals without feedback."], "answer": 1},
            {"prompt": "In a PID controller used for engine room automation, what is the primary purpose of the derivative (D) component?", "options": ["To reset the integral gain", "To reduce offset", "To predict future error by responding to the rate of change", "To eliminate steady-state error"], "answer": 2},
            {"prompt": "What is a likely consequence of adding too much refrigerant to a refrigeration system?", "options": ["Suction pressure will be unusually low", "System efficiency will increase significantly", "Compressor head pressure will be higher than normal", "The system will short cycle on the low pressure cutout"], "answer": 2},
            {"prompt": "What is the primary function of the receiver in a refrigeration system?", "options": ["It subcools the refrigerant before expansion.", "It prevents liquid slugging in the compressor.", "It collects noncondensable gases from the condenser.", "It stores liquid refrigerant for use by the system."], "answer": 3},
            {"prompt": "A vessel has traveled 1856 nautical miles at a speed of 18 knots, consuming 545 tons of fuel oil. The remaining distance to the next port is 1978 nautical miles. If the vessel increases speed to 22 knots for the rest of the journey, how much fuel will be consumed to reach the port?", "options": ["690 tons", "868 tons", "772 tons", "710 tons"], "answer": 1},
            {"prompt": "What is the primary benefit of implementing a fail-safe mechanism in shipboard automation systems?", "options": ["It increases the speed of data processing.", "It ensures the system defaults to a safe state if a fault occurs.", "It maximizes energy efficiency under normal operation.", "It allows for continuous operation at maximum capacity."], "answer": 1},
            {"prompt": "What is the most likely consequence if the intercooler of a low pressure air compressor becomes fouled, either internally or externally?", "options": ["Volumetric efficiency will be decreased", "Compressor speed will increase automatically", "Discharge pressure will increase", "Lubrication requirements will decrease"], "answer": 0},
            {"prompt": "In a reciprocating air compressor, what does the volumetric efficiency represent?", "options": ["The ratio of adiabatic work to indicated horsepower", "The ratio of isothermal work to brake horsepower", "The ratio of air indicated horsepower to brake horsepower", "The ratio of the actual volume of air delivered to the theoretical swept volume of the piston"], "answer": 3},
            {"prompt": "In the context of shipboard automation, what is the primary function of a Programmable Logic Controller (PLC)?", "options": ["Fuel oil purification", "Power generation", "Tank level sounding", "Real-time process monitoring and control logic execution"], "answer": 3},
            {"prompt": "Why is a three-wire configuration commonly used for RTDs in industrial temperature measurement systems?", "options": ["It enhances the RTD's heat absorption", "It increases the RTD's voltage output", "It compensates for resistance in the connecting wires", "It accelerates the sensor's response time"], "answer": 2},
            {"prompt": "A duplex double acting reciprocating pump operates at 170 strokes per minute. Each cylinder has a diameter of 4 inches and a stroke length of 11 inches. If the pump runs at 89% volumetric efficiency, what is the pump's total capacity in gallons per minute (gpm)?", "options": ["181 gpm", "205 gpm", "91 gpm", "249 gpm"], "answer": 0},
            {"prompt": "What is the main function of a watchdog timer in engine room automation systems?", "options": ["To minimize temperature fluctuations in sensors", "To calibrate analog input signals", "To restart or shut down the system if the control program becomes unresponsive", "To enhance pressure regulation in lubrication systems"], "answer": 2},
            {"prompt": "How does the cylinder lubricating oil feed rate to each cylinder of a large, low-speed main propulsion diesel engine typically change between sea operation and maneuvering?", "options": ["It is manually adjusted every hour at constant RPM.", "It is lower at sea than during maneuvering.", "It remains the same regardless of operating condition.", "It is higher at sea than during maneuvering."], "answer": 1},
            {"prompt": "In a medium-speed main propulsion diesel engine, which method is primarily used to deliver lubricating oil to the crankpin bearings?", "options": ["Gravity-fed oil reservoirs", "Manual lubrication with oil cans", "External oil spray nozzles", "Drilled oil passages within the crankshaft"], "answer": 3},
            {"prompt": "What is the primary effect of cooling the intake air supplied to a diesel engine?", "options": ["Decrease average compression pressure", "Reduce mean effective pressure", "Increase peak power output", "Decrease air charge density"], "answer": 2},
            {"prompt": "In a modern large low-speed main propulsion diesel engine, which method is commonly used to directly close the exhaust valves?", "options": ["Exhaust gas pressure", "Hydraulic pressure", "Large conical springs", "Compressed air pressure"], "answer": 3},
            {"prompt": "Which method is most commonly used to lubricate the upper piston rings in large, slow-speed, two-stroke diesel engines?", "options": ["Oil flow from a centrifugal or banjo oiler", "Oil fed from mechanical lubricators", "Oil supplied from wick fed drip lubricators", "Oil thrown off from the main bearings"], "answer": 1},
            {"prompt": "When reduction gears are used to match a marine engine's high speed to a propeller's efficient lower speed, what happens to the torque delivered to the propeller shaft?", "options": ["Speed remains unchanged while torque decreases.", "Both speed and torque decrease at the propeller shaft.", "Speed increases and torque decreases at the propeller shaft.", "The speed decreases and the torque increases at the propeller shaft."], "answer": 3},
            {"prompt": "Which of the following is most likely to cause slippage in an air operated friction clutch?", "options": ["Weak disc springs", "Newly installed friction blocks", "An overloaded engine", "Prolonged slow speed operation"], "answer": 0},
            {"prompt": "A ship's refrigeration system is showing low suction pressure and frost accumulation on the suction line. What is the most probable cause of these symptoms?", "options": ["Excess refrigerant charge in the system", "Dirty or blocked condenser coils", "Presence of non-condensable gases", "Restricted or malfunctioning expansion valve"], "answer": 3},
            {"prompt": "What is the main function of recirculation dampers in the accommodation ventilation system of a ship's HVAC?", "options": ["To prevent the entry of insects into the ventilation system", "To enhance the removal of airborne contaminants", "To increase the supply of fresh outside air", "To reduce energy consumption by reusing conditioned air"], "answer": 3},
        ],
    },
]


def api_request(base_url, path, method="GET", body=None, token=None):
    url = base_url.rstrip("/") + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{method} {path} -> {e.code}: {e.read().decode()}")


def upload_image_to_storage():
    """Upload the Q32 figure image via the app's own storage module — the
    same code path production uses (local disk in dev, Azure Blob when
    AZURE_STORAGE_CONNECTION_STRING/AZURE_CONTAINER_NAME are set). Only
    works when run from the backend's own venv with its .env present;
    skipped otherwise (the test still saves fine, just without the image
    reachable until someone uploads it separately)."""
    try:
        from dotenv import load_dotenv
        load_dotenv()
        from app import storage
    except ImportError:
        print("  (skipping image upload — run this from the backend/ venv to include it)")
        return False
    if storage.exists(IMAGE_STORAGE_NAMESPACE, IMAGE_STORAGE_FILENAME):
        print(f"  image already present in storage ({'Azure' if storage._USE_AZURE else 'local disk'})")
        return True
    storage.save(IMAGE_STORAGE_NAMESPACE, IMAGE_STORAGE_FILENAME, IMAGE_PATH)
    print(f"  uploaded image to storage ({'Azure' if storage._USE_AZURE else 'local disk'})")
    return True


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base-url", default="http://localhost:8000", help="API base URL (default: http://localhost:8000)")
    ap.add_argument("--email", default="admin@ozellarmarine.com")
    ap.add_argument("--password", default="Admin@123")
    args = ap.parse_args()

    print(f"Logging in to {args.base_url} as {args.email} ...")
    login = api_request(args.base_url, "/api/auth/login", "POST", {
        "mode": "admin", "email": args.email, "password": args.password,
    })
    token = login["token"]

    existing = api_request(args.base_url, "/api/admin/screening/tests", token=token)
    if any(t["title"] == TEST_TITLE for t in existing):
        print(f'A test called "{TEST_TITLE}" already exists — nothing to do.')
        return

    print("Uploading Q32 figure image ...")
    upload_image_to_storage()

    print("Creating test ...")
    test = api_request(args.base_url, "/api/admin/screening/tests", "POST", {
        "title": TEST_TITLE, "timerMinutes": 80, "correctScore": 1, "wrongPenalty": 0,
    }, token=token)
    test_id = test["id"]

    for sec in SECTIONS:
        sec_resp = api_request(
            args.base_url, f"/api/admin/screening/tests/{test_id}/sections", "POST",
            {"title": sec["title"], "section_type": "mcq", "passage": sec["passage"]}, token=token,
        )
        created = next(s for s in sec_resp["sections"] if s["title"] == sec["title"])
        questions = [
            {"prompt": q["prompt"], "options": q["options"], "answer": q["answer"], "imageUrls": q.get("imageUrls")}
            for q in sec["questions"]
        ]
        api_request(
            args.base_url,
            f"/api/admin/screening/tests/{test_id}/sections/{created['id']}/questions", "PUT",
            {"questions": questions}, token=token,
        )
        print(f'  "{sec["title"]}" — {len(questions)} questions saved')

    print(f'\nDone. "{TEST_TITLE}" is now visible in Admin → Assessment.')


if __name__ == "__main__":
    main()
