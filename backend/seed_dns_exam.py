"""Content seed: creates the "DNS Exam" screening assessment with all 80
verified questions, correct answers, passages, and figure transformation
diagrams.

Usage (from backend/ directory):
    # Standard: against running API (local or remote)
    python seed_dns_exam.py
    python seed_dns_exam.py --base-url http://localhost:8008
    python seed_dns_exam.py --base-url https://training.ozellar.com

    # Direct database insertion (works offline without API running):
    python seed_dns_exam.py --direct-db

Safe to re-run: if a test with this exact title already exists, it reports and skips
creating a duplicate (use --force to overwrite/re-seed).
"""
import argparse
import io
import json
import os
import sys
import urllib.error
import urllib.request

if sys.platform == "win32":
    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

TEST_TITLE = "DNS Exam"
TIMER_MINUTES = 70
CORRECT_SCORE = 1
WRONG_PENALTY = 0

IMAGE_STORAGE_NAMESPACE = "screening-questions"
IMAGE_FILES = [
    "dns-q47-figure-transformation.png",
    "dns-q49-shape-matrix.png",
    "dns-q50-sequence.png",
]

COMPREHENSION_1_PASSAGE = (
    "In the late 21st century, the Global Council enacted the \"Resource Equilibrium Accord\" "
    "to address escalating conflicts over dwindling freshwater reserves. The Accord introduced "
    "a tiered quota system, assigning water access rights based on each nation's ecological footprint, "
    "technological capability for desalination, and per-capita consumption history. While wealthier "
    "nations invested in advanced desalination plants and atmospheric water harvesters, poorer nations—"
    "despite having smaller ecological footprints—struggled to meet their citizens' basic needs under "
    "their reduced quotas. Critics argued that the Accord unintentionally entrenched inequality, "
    "as historical consumption patterns favored nations that had previously overused water. To address "
    "the backlash, an amendment proposed the creation of a \"Water Equity Fund\" financed by a "
    "surcharge on nations exceeding their quota. The fund would support sustainable water projects in "
    "under-resourced regions. Yet, debates raged over enforcement: how to monitor usage accurately, "
    "prevent data manipulation, and ensure that the fund genuinely benefited those in need."
)

COMPREHENSION_2_PASSAGE = (
    "A ship's crew works together to ensure the safe and smooth operation of the vessel. The Master is "
    "responsible for the overall command of the ship, while the Chief Officer manages the deck "
    "department and cargo operations. The Chief Engineer supervises all machinery and engine room "
    "activities. Each crew member has a specific duty, and teamwork is essential, especially during "
    "difficult weather or emergencies. Good communication helps prevent accidents and ensures that "
    "the ship reaches its destination safely."
)

SECTIONS = [
    {
        "title": "Comprehension — Passage 1",
        "passage": COMPREHENSION_1_PASSAGE,
        "questions": [
            {"prompt": "What was the main goal behind the introduction of the Resource Equilibrium Accord in the late 21st century? Select the option that best describes the Accord's intended purpose.", "options": ["To establish a global water trading market.", "To balance global water distribution and prevent conflicts over freshwater resources.", "To reward nations with low per-capita water consumption.", "To increase funding for desalination research."], "answer": 1},
            {"prompt": "Which aspect most contributed to the Resource Equilibrium Accord unintentionally reinforcing inequality among nations? Select the option that best identifies the root cause of the Accord's fairness issue.", "options": ["Technological advancements in desalination.", "Inaccurate monitoring of water usage.", "Historical consumption patterns that benefited countries with prior high water use.", "Opposition to the Water Equity Fund."], "answer": 2},
            {"prompt": "Which conclusion is best supported by the information provided in the passage about the Resource Equilibrium Accord? Choose the statement that most accurately reflects the passage's main implication.", "options": ["The amendment eliminated all concerns about fairness.", "Nations with smaller ecological footprints were given larger quotas.", "Wealthier nations opposed atmospheric water harvesting.", "The Accord unintentionally reinforced pre-existing inequalities."], "answer": 3},
            {"prompt": "Under the Resource Equilibrium Accord, when would a nation be required to pay a surcharge to support the Water Equity Fund? Select the option that best describes the condition for triggering the surcharge.", "options": ["When its per-capita consumption is below the global average.", "When it fails to reduce its ecological footprint.", "When it does not participate in atmospheric water harvesting.", "When its water usage exceeds the assigned quota."], "answer": 3},
            {"prompt": "What is the main challenge that remains unresolved regarding the amendment to the Resource Equilibrium Accord? Select the option that best identifies the key issue still facing the amendment.", "options": ["Lack of sustainable water project ideas.", "The unwillingness of wealthier nations to pay surcharges.", "Uncertainty in the fund's revenue source.", "Ensuring transparency and preventing misuse of funds."], "answer": 3},
        ],
    },
    {
        "title": "Comprehension — Passage 2",
        "passage": COMPREHENSION_2_PASSAGE,
        "questions": [
            {"prompt": "Who holds the highest authority and responsibility for the entire ship's operations? Select the individual who is ultimately in charge of the vessel.", "options": ["Master", "Chief Officer", "Bosun", "Chief Engineer"], "answer": 0},
            {"prompt": "Who oversees the maintenance and functioning of all machinery in the engine room? Select the individual whose primary duty is engine room management.", "options": ["Chief Officer", "Electrician", "Deck Cadet", "Chief Engineer"], "answer": 3},
            {"prompt": "Why is collaboration among crew members essential on board a ship? Select the option that best explains the importance of working together at sea.", "options": ["To reduce food consumption", "To ensure safe and efficient operations", "To shorten the voyage time", "To make the ship look clean"], "answer": 1},
            {"prompt": "Which factor is most important for preventing accidents and ensuring safety on a ship? Select the option that best explains how accidents are avoided at sea.", "options": ["Sailing during storms", "Having a larger crew", "Good communication among crew members", "Increasing the ship's speed"], "answer": 2},
            {"prompt": "Which responsibility is primarily assigned to the Chief Officer on a ship? Select the option that best describes the Chief Officer's main duty.", "options": ["Preparing meals for the crew", "Navigating the vessel during voyages", "Operating and maintaining engine room equipment", "Overseeing deck department and supervising cargo handling"], "answer": 3},
        ],
    },
    {
        "title": "English Aptitude",
        "passage": None,
        "questions": [
            {"prompt": "Choose the correct word to complete the sentence: The manager demanded that the documents ___ delivered before the meeting. Select the most appropriate verb form.", "options": ["being", "is", "was", "be"], "answer": 3},
            {"prompt": "Identify the part of the sentence that contains an error: \"Neither of the engineers are available for the meeting.\" Select the option that highlights the grammatical mistake.", "options": ["are", "the engineers", "Neither of", "available for the meeting"], "answer": 0},
            {"prompt": "Vocabulary – Synonyms Which word is most similar in meaning to 'Reluctant'? Select the option that best matches the meaning of 'Reluctant'.", "options": ["Willing", "Confident", "Hesitant", "Certain"], "answer": 2},
            {"prompt": "If someone is said to 'sail close to the wind,' what are they doing? Choose the most accurate interpretation of this idiom.", "options": ["Navigating through rough seas", "Working hard to overcome adversity", "Taking risks or behaving in a way that nearly breaks the rules", "Defying orders from superiors"], "answer": 2},
            {"prompt": "Although the engine failed, the crew managed to complete the journey. What is the main idea of this sentence?", "options": ["The journey was canceled due to engine failure.", "The engine was repaired before departure.", "The crew abandoned the vessel.", "The crew overcame difficulties and finished the trip."], "answer": 3},
            {"prompt": "Choose the option that best completes the sentence: \"The ship's crew worked tirelessly ______ the cargo was discharged safely.\"", "options": ["so that", "unless", "although", "because"], "answer": 0},
            {"prompt": "Choose the correct antonym of the word \"Expand\":", "options": ["increase", "Stretch", "Contract", "Continue"], "answer": 2},
            {"prompt": "The officers were advised to ______ the safety procedures carefully.", "options": ["ignore", "observe", "miss", "deny"], "answer": 1},
            {"prompt": "Which sentence uses 'information' correctly? Select the grammatically correct option.", "options": ["Information are accurate.", "The information is accurate.", "The information are accurate.", "The informations are accurate."], "answer": 1},
            {"prompt": "Choose the word that best completes the analogy: \"Doctor : Hospital :: Teacher : _____\"", "options": ["Classroom", "Book", "School", "Student"], "answer": 2},
        ],
    },
    {
        "title": "Numerical Aptitude",
        "passage": None,
        "questions": [
            {"prompt": "In a ship's crew, the ratio of Deck department members to Engine department members is 5:3. If the total number of crew is 120, how many crew members belong to the Engine department? Select the correct number of Engine department crew members.", "options": ["60", "45", "40", "50"], "answer": 1},
            {"prompt": "A person needs to walk from one corner of a square park to the opposite corner. If he walks along the edges, he covers the length of two sides, but if he walks diagonally, he takes the shortest route. Approximately what percentage of distance does he save by walking diagonally instead of along the edges?", "options": ["29%", "24%", "33%", "20%"], "answer": 0},
            {"prompt": "Two boats are anchored on opposite sides of a 100 m tall lighthouse. From the boats, the angles of elevation to the top of the lighthouse are 30° and 45° respectively. What is the distance between the two boats?", "options": ["273 m", "173 m", "200 m", "300 m"], "answer": 0},
            {"prompt": "A ship turns 90° right from North. Which direction is it facing now?", "options": ["North-East", "South", "West", "East"], "answer": 3},
            {"prompt": "If $4,000 is invested at 5% per annum simple interest, how much interest will be earned in 4 years? Select the correct amount of interest earned.", "options": ["$1,000", "$800", "$700", "$600"], "answer": 1},
            {"prompt": "If the ratio of officers to cadets on a ship is 3:7 and there are 21 cadets, how many officers are there?", "options": ["8", "9", "6", "7"], "answer": 1},
            {"prompt": "A person walks 3 km East and then 4 km North. What is the shortest distance from the starting point?", "options": ["5 km", "7 km", "8 km", "6 km"], "answer": 0},
            {"prompt": "A lifeboat can carry 25 persons. If there are 118 persons onboard, what is the minimum number of lifeboats required?", "options": ["5", "6", "7", "4"], "answer": 0},
            {"prompt": "Which number comes next in the series? 2, 6, 12, 20, 30, ___", "options": ["36", "44", "42", "40"], "answer": 2},
            {"prompt": "A bag contains 2 red, 3 green, and 2 blue balls. If two balls are drawn at random, what is the probability that neither ball drawn is blue? Choose the correct probability.", "options": ["2/7", "10/21", "5/7", "11/21"], "answer": 1},
            {"prompt": "A ship records daily fuel consumption for five consecutive days. The average consumption is 28 tons per day. If the first four days' consumptions are 30, 26, 29, and 27 tons, what is the fuel consumption on the fifth day? Select the correct amount consumed on the fifth day.", "options": ["28 tons", "27 tons", "26 tons", "29 tons"], "answer": 0},
            {"prompt": "Water is leaking from a tank at 15 litres per minute. How much water will leak in 2 hours?", "options": ["900 litres", "1200 litres", "1500 litres", "1800 litres"], "answer": 3},
            {"prompt": "A clock shows 3:15. What is the angle between the hour hand and minute hand?", "options": ["0°", "7.5°", "22.5°", "15°"], "answer": 1},
            {"prompt": "If 5 crew members can complete maintenance work in 12 hours, how many hours will 10 crew members take for the same work?", "options": ["10 hours", "6 hours", "8 hours", "5 hours"], "answer": 1},
            {"prompt": "If \"PORT\" is coded as \"QPSU\", then \"SHIP\" will be coded as:", "options": ["SIJQ", "TIJQ", "TJIQ", "TIKQ"], "answer": 1},
            {"prompt": "Which figure comes next?▲ ■ ● ▲ ■ ?", "options": ["◆", "■", "●", "▲"], "answer": 2},
            {"prompt": "Which set of figures best illustrates the transformation where closed shapes gradually open up and open shapes gradually close? Select the correct option that follows the described pattern.", "options": ["Option 1", "Option 2", "Option 3", "Option 4"], "answer": 0, "imageUrls": ["/api/uploads/screening-questions/dns-q47-figure-transformation.png"]},
            {"prompt": "Two students appeared for an exam. One scored 9 marks more than the other, and his marks were 56% of the total marks obtained by both. What are their marks? Choose the correct pair of marks.", "options": ["39, 30", "43, 34", "41, 32", "42, 33"], "answer": 3},
            {"prompt": "Identify the correct shape to be placed in 'D'. (Choose the correct answer).", "options": ["Option A", "Option B", "Option C", "Option d"], "answer": 1, "imageUrls": ["/api/uploads/screening-questions/dns-q49-shape-matrix.png"]},
            {"prompt": "Choose the correct option in sequence.", "options": ["option A", "Option B", "Option C", "Option D"], "answer": 0, "imageUrls": ["/api/uploads/screening-questions/dns-q50-sequence.png"]},
        ],
    },
    {
        "title": "Physics & Chemistry",
        "passage": None,
        "questions": [
            {"prompt": "What is the speed of light in a vacuum? Select the correct value and unit for the speed of light.", "options": ["3 x 10⁸ m/sec²", "3 x 10⁸ m/sec", "3 x 10⁸ km/sec", "3 x 10⁸ km/sec²"], "answer": 1},
            {"prompt": "Which scientific law describes the upward force that enables ships to remain afloat? Select the law that accounts for the buoyancy of ships.", "options": ["Pascal's Law", "Bernoulli's Principle", "Newton's Third Law", "Archimedes' Principle"], "answer": 3},
            {"prompt": "Which term best describes the resistance encountered by a vessel as it moves through water? Select the correct type of force acting against a ship's forward motion.", "options": ["Thrust", "Buoyant Force", "Frictional Resistance", "Centripetal Force"], "answer": 2},
            {"prompt": "A pressure of 2 × 10⁵ Pa is exerted on the bottom of a tank by freshwater. If the base area is 4 m², what is the total force acting on the base? Select the correct value for the force applied.", "options": ["4 × 10⁵ N", "2 × 10⁵ N", "6 × 10⁵ N", "8 × 10⁵ N"], "answer": 3},
            {"prompt": "Which of the following physical quantities is classified as a vector? Select the option that represents a vector quantity.", "options": ["Temperature", "Velocity", "Distance", "Speed"], "answer": 1},
            {"prompt": "When light travels from air to water, it:", "options": ["Travels in a straight line", "Speeds up", "Slows down", "Disappears"], "answer": 2},
            {"prompt": "Which device is primarily used by sailors to determine their heading while navigating at sea? Select the correct navigational instrument.", "options": ["Barometer", "Compass", "Anemometer", "Thermometer"], "answer": 1},
            {"prompt": "Which primary factor is responsible for the occurrence of tides in Earth's oceans? Select the most accurate explanation for the origin of ocean tides.", "options": ["Changes in ocean water temperature", "Wind patterns over the sea surface", "Movement of ocean currents", "Gravitational forces exerted by the Moon and the Sun"], "answer": 3},
            {"prompt": "Which type of wave can travel through a vacuum without the need for a material medium? Select the correct type of wave.", "options": ["Electromagnetic wave", "Sound wave", "Mechanical wave", "Longitudinal wave"], "answer": 0},
            {"prompt": "What is the correct full form of the acronym LASER? Select the most accurate expansion of LASER.", "options": ["Light Amplification by Secured Emission of Radiation", "Light Amplification by Stimulated Emission of Radiation", "Light Amplification by Secured Emission of Radioactive materials", "Light Amplification by Single Emission of Radiation"], "answer": 1},
            {"prompt": "What is the standard acceleration due to gravity for an object in free fall near Earth's surface?", "options": ["19.6 m/s²", "4.9 m/s²", "1 m/s²", "9.8 m/s²"], "answer": 3},
            {"prompt": "What happens to atmospheric pressure as altitude increases?", "options": ["Increases", "Decreases", "Remains constant", "Becomes zero"], "answer": 1},
            {"prompt": "A lifeboat accelerates from rest to 6 m/s in 3 seconds. What is its acceleration?", "options": ["1 m/s²", "2 m/s²", "3 m/s²", "4 m/s²"], "answer": 1},
            {"prompt": "A ship turning in a circular path experiences which force?", "options": ["Centrifugal force", "Magnetic force", "Gravitational force", "Electrostatic force"], "answer": 0},
            {"prompt": "What is the scientific term for the duration of one full oscillation of a wave? Select the correct term that describes the time for a single wave cycle.", "options": ["Period", "Frequency", "Wavelength", "Amplitude"], "answer": 0},
            {"prompt": "Which of the following is the correct SI unit used to measure pressure? Select the appropriate unit for pressure in the International System of Units.", "options": ["Newton", "Watt", "Joule", "Pascal"], "answer": 3},
            {"prompt": "A wire has a resistance of 10 ohms. If a current of 2 amperes passes through it for 5 seconds, how much heat energy is generated? Select the correct amount of heat produced using H = I²Rt.", "options": ["100 J", "150 J", "200 J", "50 J"], "answer": 2},
            {"prompt": "A ship detects a target using radar. The signal takes 4 × 10⁻⁴ seconds to travel to the target and back. If the speed of the radar signal is 3 × 10⁸ m/s, what is the distance from the ship to the target? Select the correct calculated distance.", "options": ["30 km", "120 km", "60 km", "90 km"], "answer": 2},
            {"prompt": "A 4 kg cart moving at 5 m/s collides and joins with a stationary cart of 6 kg. What is the final velocity of the combined carts? Calculate the final velocity using conservation of momentum.", "options": ["4 m/s", "2 m/s", "3 m/s", "5 m/s"], "answer": 1},
            {"prompt": "A ship uses sonar to measure the depth of the ocean. If the sonar pulse takes 4 seconds to travel to the seabed and back, and the speed of sound in seawater is 1500 m/s, what is the depth below the ship? Select the correct depth based on the sonar reading.", "options": ["750 m", "6000 m", "3000 m", "2000 m"], "answer": 1},
            {"prompt": "The mass number of an atom is determined by which of the following combinations? Select the correct combination that defines the mass number.", "options": ["Number of protons plus number of neutrons", "Number of protons plus number of electrons", "Number of electrons plus number of neutrons", "Number of neutrons only"], "answer": 0},
            {"prompt": "What does the escape velocity of a rocket launched from Earth represent? Choose the most accurate description of escape velocity.", "options": ["The speed to balance Earth's rotational force", "The minimum speed needed to overcome Earth's gravitational attraction", "The speed required to escape the Moon's gravity", "The velocity needed to counteract atmospheric pressure"], "answer": 1},
            {"prompt": "Which of the following represents the correct electronic configuration for an element with atomic number 17? Select the correct arrangement of electrons in shells.", "options": ["2, 6, 9", "2, 7, 8", "2, 8, 8", "2, 8, 7"], "answer": 3},
            {"prompt": "Which of the following gases does NOT contribute to the greenhouse effect in Earth's atmosphere? Select the gas that is not considered a greenhouse gas.", "options": ["Water vapour", "Carbon dioxide", "Nitrogen", "Methane"], "answer": 2},
            {"prompt": "Which type of mirror do dental professionals commonly use to inspect the inside surfaces of a patient's mouth? Select the most suitable mirror for dental examinations.", "options": ["Cylindrical mirror", "Convex mirror", "Concave mirror", "Plane mirror"], "answer": 2},
            {"prompt": "Which chemical equation below best illustrates a decomposition reaction? Select the option that represents a single compound breaking down into two or more simpler substances.", "options": ["Na + Cl → NaCl", "Fe + CuSO₄ → FeSO₄ + Cu", "CaCO₃ → CaO + CO₂", "H₂ + Cl₂ → 2HCl"], "answer": 2},
            {"prompt": "Which acid is commonly found in car batteries?", "options": ["hydrocloric acid", "Nitric Acid", "Sulphuric acid", "Acetic acid"], "answer": 2},
            {"prompt": "What does a pH value below 7 indicate about a solution? Select the option that best describes the nature of the solution.", "options": ["Salt solution", "Basic solution", "Neutral solution", "Acidic solution"], "answer": 3},
            {"prompt": "Which process listed below is an example of a chemical change? Select the option that demonstrates a chemical transformation.", "options": ["Melting of ice", "Breaking a glass", "Rusting of iron", "Dissolving sugar in water"], "answer": 2},
            {"prompt": "Which gas listed below is a major contributor to the greenhouse effect in Earth's atmosphere? Select the gas that plays a significant role in trapping heat and warming the planet.", "options": ["Ozone", "Argon", "Helium", "Carbon dioxide"], "answer": 3},
            {"prompt": "Which combination of elements is primarily used to produce stainless steel? Select the option that correctly identifies the main alloying elements in stainless steel.", "options": ["Iron, carbon, and chromium", "Iron, copper, and zinc", "Iron, sodium, and chlorine", "Iron, aluminium, and magnesium"], "answer": 0},
            {"prompt": "What is the primary method employed on ships to make seawater safe for human consumption? Select the process most commonly used to obtain potable water from seawater aboard ships.", "options": ["Evaporation", "Filtration", "Sedimentation", "Desalination"], "answer": 3},
            {"prompt": "What is the IUPAC name of CH₃–CH₂–CH₃?", "options": ["Propene", "Propane", "Butane", "Ethane"], "answer": 1},
            {"prompt": "Which of the following compounds is an alkene? A. C₂H₆ B. C₃H₆ C. C₄H₁₀ D. C₅H₁₂", "options": ["C₂H₆", "C₃H₆", "C. C₄H₁₀", "D. C₅H₁₂"], "answer": 1},
            {"prompt": "Which gas law describes the relationship where the pressure of a fixed amount of gas increases as its volume decreases, provided the temperature remains constant? Select the law that best fits this description.", "options": ["Gay-Lussac's Law", "Avogadro's Law", "Boyle's Law", "Charles' Law"], "answer": 2},
            {"prompt": "Which of the following values correctly represents Avogadro's constant? Select the option that gives the correct value for Avogadro's number.", "options": ["1.6 × 10⁻¹⁹", "6.022 × 10²³", "3.01 × 10²²", "9.11 × 10⁻³¹"], "answer": 1},
            {"prompt": "For an endothermic chemical reaction, what is the sign of the enthalpy change (ΔH)? Select the correct option regarding the value of ΔH.", "options": ["ΔH is negative", "ΔH is always -273", "ΔH is always zero", "ΔH is positive"], "answer": 3},
            {"prompt": "Which of the following equations correctly represents the ideal gas law? Select the option that shows the relationship between pressure, volume, temperature, and amount of gas.", "options": ["PV = mRT", "PV/T = constant", "P + V = RT", "PV = nRT"], "answer": 3},
            {"prompt": "Identify the correct displacement reaction:", "options": ["A. Cu + ZnSO₄ → CuSO₄ + Zn", "B. Zn + CuSO₄ → ZnSO₄ + Cu", "C. NaCl + Ag → AgCl + Na", "D. CuSO₄ + FeSO₄ → CuFe(SO₄)₂"], "answer": 1},
            {"prompt": "Which of the following chemical equations correctly represents the decomposition of calcium carbonate to produce carbon dioxide? Select the balanced equation for the reaction.", "options": ["CaCO₃ → CaO + CO₂", "CaCO₃ → Ca + CO₂", "CaCO₃ + CO₂ → CaO₂", "CaCO₃ → CaCO₂ + O₂"], "answer": 0},
        ],
    },
]


def upload_images_to_storage():
    """Upload required question figures to storage (local disk in dev, Azure in prod)."""
    try:
        from dotenv import load_dotenv
        load_dotenv()
        from app import storage
    except ImportError:
        print("  (skipping image upload — storage module not found in python path)")
        return False

    for fname in IMAGE_FILES:
        fpath = os.path.join(SCRIPT_DIR, "seed_assets", fname)
        if not os.path.exists(fpath):
            print(f"  Warning: seed image file not found: {fpath}")
            continue
        if storage.exists(IMAGE_STORAGE_NAMESPACE, fname):
            print(f"  Image already in storage: {fname}")
        else:
            storage.save(IMAGE_STORAGE_NAMESPACE, fname, fpath)
            print(f"  Uploaded image to storage: {fname}")
    return True


def api_request(base_url, path, method="GET", body=None, token=None):
    url = base_url.rstrip("/") + path
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json; charset=utf-8")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {path} -> {e.code}: {e.read().decode('utf-8')}")


def seed_via_api(base_url, email, password, force=False):
    print(f"Connecting to API at {base_url} as {email} ...")
    login = api_request(base_url, "/api/auth/login", "POST", {
        "mode": "admin", "email": email, "password": password,
    })
    token = login["token"]

    existing = api_request(base_url, "/api/admin/screening/tests", token=token)
    matched = [t for t in existing if t["title"] == TEST_TITLE]
    if matched:
        if not force:
            print(f'Test "{TEST_TITLE}" already exists (id={matched[0]["id"]}) — nothing to do. Use --force to recreate.')
            return
        print(f'Deleting existing test "{TEST_TITLE}" (id={matched[0]["id"]}) due to --force ...')
        api_request(base_url, f'/api/admin/screening/tests/{matched[0]["id"]}', "DELETE", token=token)

    print("Uploading question diagram images ...")
    upload_images_to_storage()

    print(f'Creating test "{TEST_TITLE}" ...')
    test = api_request(base_url, "/api/admin/screening/tests", "POST", {
        "title": TEST_TITLE,
        "timerMinutes": TIMER_MINUTES,
        "correctScore": CORRECT_SCORE,
        "wrongPenalty": WRONG_PENALTY,
    }, token=token)
    test_id = test["id"]

    for sec in SECTIONS:
        sec_resp = api_request(
            base_url, f"/api/admin/screening/tests/{test_id}/sections", "POST",
            {"title": sec["title"], "section_type": "mcq", "passage": sec["passage"]},
            token=token,
        )
        created = next(s for s in sec_resp["sections"] if s["title"] == sec["title"])
        questions = [
            {"prompt": q["prompt"], "options": q["options"], "answer": q["answer"], "imageUrls": q.get("imageUrls")}
            for q in sec["questions"]
        ]
        api_request(
            base_url,
            f"/api/admin/screening/tests/{test_id}/sections/{created['id']}/questions", "PUT",
            {"questions": questions}, token=token,
        )
        print(f'  Section "{sec["title"]}" — {len(questions)} questions saved')

    print(f'\nDone! "{TEST_TITLE}" (80 questions, 70 min) is now live and visible in Admin -> Assessment.')


def seed_via_db(force=False):
    print("Seeding directly via database session...")
    os.chdir(SCRIPT_DIR)
    sys.path.insert(0, SCRIPT_DIR)
    from app.database import SessionLocal
    from app import models

    db = SessionLocal()
    try:
        existing = db.query(models.ScreeningTest).filter_by(title=TEST_TITLE).first()
        if existing:
            if not force:
                print(f'Test "{TEST_TITLE}" already exists in DB (id={existing.id}) — nothing to do. Use --force to recreate.')
                return
            print(f'Deleting existing test "{TEST_TITLE}" (id={existing.id}) due to --force ...')
            db.delete(existing)
            db.commit()

        print("Uploading question diagram images ...")
        upload_images_to_storage()

        print(f'Creating test "{TEST_TITLE}" in database ...')
        test = models.ScreeningTest(
            title=TEST_TITLE,
            timer_minutes=TIMER_MINUTES,
            correct_score=CORRECT_SCORE,
            wrong_penalty=WRONG_PENALTY,
        )
        db.add(test)
        db.flush()

        # Add Personal Details section
        db.add(models.ScreeningSection(
            test_id=test.id,
            title="Personal Details",
            section_type="personal_data",
            order=0,
        ))

        # Add MCQ sections and questions
        for s_idx, sec in enumerate(SECTIONS):
            section = models.ScreeningSection(
                test_id=test.id,
                title=sec["title"],
                section_type="mcq",
                passage=sec["passage"],
                order=s_idx + 1,
            )
            db.add(section)
            db.flush()

            for q_idx, q in enumerate(sec["questions"]):
                question = models.ScreeningQuestion(
                    section_id=section.id,
                    prompt=q["prompt"],
                    options=q["options"],
                    answer=q["answer"],
                    image_urls=q.get("imageUrls"),
                    order=q_idx,
                )
                db.add(question)

            print(f'  Section "{sec["title"]}" — {len(sec["questions"])} questions created')

        db.commit()
        print(f'\nDone! "{TEST_TITLE}" (80 questions, 70 min) is seeded directly in DB.')
    finally:
        db.close()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base-url", default=None, help="API base URL (default: http://127.0.0.1:8008)")
    ap.add_argument("--email", default="admin@ozellarmarine.com")
    ap.add_argument("--password", default="Admin@123")
    ap.add_argument("--direct-db", action="store_true", help="Insert directly via database session (default if API not running)")
    ap.add_argument("--force", action="store_true", help="Delete and recreate if test already exists")
    args = ap.parse_args()

    if args.direct_db:
        seed_via_db(force=args.force)
        return

    target_url = args.base_url or "http://127.0.0.1:8008"
    try:
        seed_via_api(target_url, args.email, args.password, force=args.force)
    except Exception as e:
        if args.base_url:
            print(f"Error connecting to API at {args.base_url}: {e}")
            sys.exit(1)
        print(f"API server not reachable at {target_url} ({e}).")
        print("Falling back to direct database insertion...")
        seed_via_db(force=args.force)


if __name__ == "__main__":
    main()
