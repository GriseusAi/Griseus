import { db } from "./db";
import { eq } from "drizzle-orm";
import {
  trades,
  skills,
  certifications,
  tradesCertifications,
  projectPhases,
  projectPhasesTrades,
  workerSkills,
  workerCertifications,
  workers,
} from "@shared/schema";

export async function seedOntology() {
  // Skip if already seeded
  const existingTrades = await db.select().from(trades);
  if (existingTrades.length > 0) {
    console.log("Ontology tables already seeded, skipping.");
    return;
  }

  // ── TRADES ──────────────────────────────────────────────────────────
  const createdTrades = await db.insert(trades).values([
    { name: "Electrician", category: "Electrical", description: "Installs and maintains power distribution systems including switchgear, transformers, UPS, PDUs, and branch circuits in mission-critical facilities." },
    { name: "HVAC Technician", category: "Mechanical", description: "Installs, services, and commissions heating, ventilation, air conditioning, and precision cooling systems for data center environments." },
    { name: "Plumber/Pipefitter", category: "Mechanical", description: "Installs chilled water piping, glycol loops, condensate lines, drainage systems, and fire suppression piping in data center facilities." },
    { name: "Structural Ironworker", category: "Structural", description: "Erects structural steel framing, metal decking, and miscellaneous metals for data center buildings and support structures." },
    { name: "Concrete Worker", category: "Structural", description: "Forms, pours, and finishes concrete foundations, slabs, equipment pads, and elevated decks for data center construction." },
    { name: "Fire Protection Specialist", category: "Life Safety", description: "Designs, installs, and inspects fire suppression systems including clean agent, pre-action sprinklers, and VESDA detection for data centers." },
    { name: "Low Voltage Technician", category: "Technology", description: "Installs structured cabling, fiber optics, cable tray, and network infrastructure for data center connectivity." },
    { name: "Mechanical Insulator", category: "Mechanical", description: "Applies thermal and acoustic insulation to piping, ductwork, and mechanical equipment to maintain efficiency and prevent condensation." },
    { name: "Sheet Metal Worker", category: "Mechanical", description: "Fabricates and installs HVAC ductwork, louvers, dampers, and architectural sheet metal for data center mechanical systems." },
    { name: "Controls/BMS Technician", category: "Technology", description: "Programs and commissions building management systems, EPMS, and industrial controls for monitoring and automating critical facility infrastructure." },
    { name: "Welder", category: "Welding/Fabrication", description: "Performs structural and pipe welding using SMAW, GMAW, FCAW, and GTAW processes for data center steel erection and mechanical systems." },
    { name: "General Labor", category: "General", description: "Provides general construction support including raised floor installation, cable tray mounting, material handling, and site cleanup on data center projects." },
  ]).returning();

  const tradeMap: Record<string, string> = {};
  for (const t of createdTrades) {
    tradeMap[t.name] = t.id;
  }

  // ── SKILLS ──────────────────────────────────────────────────────────
  const skillsData = [
    // Electrician (6)
    { name: "Cable Pulling", tradeId: tradeMap["Electrician"], description: "Running power and control cables through conduit, cable tray, and raceways per NEC specifications.", difficultyLevel: 2 },
    { name: "Conduit Bending", tradeId: tradeMap["Electrician"], description: "Bending EMT, rigid, and IMC conduit using hand benders and hydraulic machines for power distribution routing.", difficultyLevel: 3 },
    { name: "Panel Installation", tradeId: tradeMap["Electrician"], description: "Mounting, wiring, and terminating electrical distribution panels, RPPs, and branch circuit panelboards.", difficultyLevel: 3 },
    { name: "Transformer Termination", tradeId: tradeMap["Electrician"], description: "Terminating medium and low-voltage dry-type and cast-coil transformers with proper torque and phasing.", difficultyLevel: 4 },
    { name: "Grounding Systems", tradeId: tradeMap["Electrician"], description: "Installing grounding electrode systems, ground rings, bonding jumpers, and isolated ground circuits per IEEE 142.", difficultyLevel: 4 },
    { name: "Arc Flash Testing", tradeId: tradeMap["Electrician"], description: "Performing arc flash hazard analysis, labeling, and verification testing on energized electrical equipment.", difficultyLevel: 5 },

    // HVAC Technician (5)
    { name: "Chiller Installation", tradeId: tradeMap["HVAC Technician"], description: "Setting, piping, and commissioning centrifugal and screw-type chillers for data center cooling plants.", difficultyLevel: 4 },
    { name: "CRAC Unit Setup", tradeId: tradeMap["HVAC Technician"], description: "Installing and configuring Computer Room Air Conditioning units with underfloor air delivery systems.", difficultyLevel: 3 },
    { name: "Cooling Tower Assembly", tradeId: tradeMap["HVAC Technician"], description: "Assembling field-erected cooling towers including fill media, fans, basins, and water treatment systems.", difficultyLevel: 3 },
    { name: "Refrigerant Handling", tradeId: tradeMap["HVAC Technician"], description: "Charging, recovering, and managing refrigerants in compliance with EPA regulations and OEM specifications.", difficultyLevel: 3 },
    { name: "Ductwork Fabrication", tradeId: tradeMap["HVAC Technician"], description: "Fabricating and installing sheet metal and fiberglass ductwork for supply, return, and exhaust air systems.", difficultyLevel: 2 },

    // Plumber/Pipefitter (5)
    { name: "Chilled Water Piping", tradeId: tradeMap["Plumber/Pipefitter"], description: "Installing carbon steel and copper chilled water supply and return piping with proper supports and expansion joints.", difficultyLevel: 4 },
    { name: "Glycol Loop Installation", tradeId: tradeMap["Plumber/Pipefitter"], description: "Installing closed-loop glycol piping systems for dry coolers and economizer cooling circuits.", difficultyLevel: 4 },
    { name: "Backflow Prevention", tradeId: tradeMap["Plumber/Pipefitter"], description: "Installing and testing reduced pressure zone backflow preventers and double-check valve assemblies.", difficultyLevel: 3 },
    { name: "Condensate Piping", tradeId: tradeMap["Plumber/Pipefitter"], description: "Running condensate drain lines from CRAH/CRAC units, air handlers, and cooling coils to collection systems.", difficultyLevel: 2 },
    { name: "Pressure Testing", tradeId: tradeMap["Plumber/Pipefitter"], description: "Performing hydrostatic and pneumatic pressure tests on piping systems per ASME B31.9 standards.", difficultyLevel: 3 },

    // Structural Ironworker (5)
    { name: "Steel Erection", tradeId: tradeMap["Structural Ironworker"], description: "Erecting structural steel columns, beams, girders, and bracing using cranes and rigging equipment.", difficultyLevel: 4 },
    { name: "Metal Decking", tradeId: tradeMap["Structural Ironworker"], description: "Installing corrugated metal roof and floor decking with proper fastening and edge securement.", difficultyLevel: 3 },
    { name: "Structural Bolting", tradeId: tradeMap["Structural Ironworker"], description: "Installing and tensioning high-strength structural bolts per AISC specifications using calibrated wrenches.", difficultyLevel: 3 },
    { name: "Rigging", tradeId: tradeMap["Structural Ironworker"], description: "Planning and executing critical lifts of steel members and heavy equipment using slings, shackles, and spreader bars.", difficultyLevel: 5 },
    { name: "Welding Layout", tradeId: tradeMap["Structural Ironworker"], description: "Laying out and preparing structural steel connections for field welding per AWS D1.1 details.", difficultyLevel: 4 },

    // Concrete Worker (5)
    { name: "Foundation Forming", tradeId: tradeMap["Concrete Worker"], description: "Building formwork for spread footings, grade beams, and pile caps using lumber and prefabricated form systems.", difficultyLevel: 3 },
    { name: "Slab Pouring", tradeId: tradeMap["Concrete Worker"], description: "Placing, vibrating, and finishing concrete slabs-on-grade with proper slope, joints, and surface tolerance.", difficultyLevel: 3 },
    { name: "Post-Tensioning", tradeId: tradeMap["Concrete Worker"], description: "Installing post-tension cable systems in elevated concrete decks for long-span data center floor construction.", difficultyLevel: 5 },
    { name: "Rebar Tying", tradeId: tradeMap["Concrete Worker"], description: "Placing and tying reinforcing steel bars per structural drawings with proper spacing, cover, and lap lengths.", difficultyLevel: 2 },
    { name: "Equipment Pad Construction", tradeId: tradeMap["Concrete Worker"], description: "Forming and pouring elevated concrete pads for generators, chillers, transformers, and mechanical equipment.", difficultyLevel: 3 },

    // Fire Protection Specialist (5)
    { name: "Clean Agent Systems", tradeId: tradeMap["Fire Protection Specialist"], description: "Installing FM-200 and Novec 1230 clean agent fire suppression systems in data center white space.", difficultyLevel: 5 },
    { name: "Pre-Action Sprinklers", tradeId: tradeMap["Fire Protection Specialist"], description: "Installing double-interlock pre-action sprinkler systems with electronic releasing panels for IT spaces.", difficultyLevel: 4 },
    { name: "VESDA Installation", tradeId: tradeMap["Fire Protection Specialist"], description: "Installing Very Early Smoke Detection Apparatus air sampling systems with proper pipe routing and programming.", difficultyLevel: 4 },
    { name: "Fire Alarm Wiring", tradeId: tradeMap["Fire Protection Specialist"], description: "Wiring fire alarm control panels, initiating devices, and notification appliances per NFPA 72.", difficultyLevel: 3 },
    { name: "Wet Sprinkler Systems", tradeId: tradeMap["Fire Protection Specialist"], description: "Installing wet-pipe sprinkler systems for non-IT support areas, offices, and warehouse spaces.", difficultyLevel: 2 },

    // Low Voltage Technician (5)
    { name: "Fiber Optic Termination", tradeId: tradeMap["Low Voltage Technician"], description: "Terminating single-mode and multi-mode fiber optic cables using fusion splicing and mechanical connectors.", difficultyLevel: 4 },
    { name: "Cable Tray Installation", tradeId: tradeMap["Low Voltage Technician"], description: "Installing ladder, wire basket, and solid-bottom cable tray systems with proper supports and grounding.", difficultyLevel: 2 },
    { name: "Network Rack Building", tradeId: tradeMap["Low Voltage Technician"], description: "Assembling and wiring network racks with patch panels, cable management, and PDU power connections.", difficultyLevel: 3 },
    { name: "Structured Cabling", tradeId: tradeMap["Low Voltage Technician"], description: "Installing Cat6A and Cat6 copper cabling with proper termination, testing, and labeling per TIA/EIA standards.", difficultyLevel: 3 },
    { name: "OTDR Testing", tradeId: tradeMap["Low Voltage Technician"], description: "Using Optical Time Domain Reflectometers to certify fiber optic links and identify faults or loss events.", difficultyLevel: 4 },

    // Mechanical Insulator (4)
    { name: "Pipe Insulation", tradeId: tradeMap["Mechanical Insulator"], description: "Applying fiberglass, elastomeric, and phenolic insulation to chilled water and hot water piping systems.", difficultyLevel: 3 },
    { name: "Duct Insulation", tradeId: tradeMap["Mechanical Insulator"], description: "Wrapping and securing insulation on HVAC ductwork to prevent thermal loss and condensation.", difficultyLevel: 2 },
    { name: "Firestop Installation", tradeId: tradeMap["Mechanical Insulator"], description: "Installing UL-listed firestop systems at fire-rated wall and floor penetrations per approved details.", difficultyLevel: 3 },
    { name: "Vapor Barrier Application", tradeId: tradeMap["Mechanical Insulator"], description: "Applying vapor barriers and jacketing to insulated piping and equipment to prevent moisture infiltration.", difficultyLevel: 2 },

    // Sheet Metal Worker (5)
    { name: "Duct Fabrication", tradeId: tradeMap["Sheet Metal Worker"], description: "Fabricating rectangular and round sheet metal ductwork from shop drawings using plasma cutters and brakes.", difficultyLevel: 3 },
    { name: "Louver Installation", tradeId: tradeMap["Sheet Metal Worker"], description: "Installing intake and exhaust louvers with bird screens, actuated dampers, and weather hoods.", difficultyLevel: 2 },
    { name: "Damper Installation", tradeId: tradeMap["Sheet Metal Worker"], description: "Installing fire dampers, smoke dampers, and combination fire/smoke dampers at rated barrier penetrations.", difficultyLevel: 3 },
    { name: "Architectural Metal Panels", tradeId: tradeMap["Sheet Metal Worker"], description: "Installing metal wall panels, fascia, and coping on data center building exteriors.", difficultyLevel: 3 },
    { name: "Hot/Cold Aisle Containment", tradeId: tradeMap["Sheet Metal Worker"], description: "Fabricating and installing sheet metal containment systems for hot and cold aisle configurations.", difficultyLevel: 4 },

    // Controls/BMS Technician (5)
    { name: "BMS Programming", tradeId: tradeMap["Controls/BMS Technician"], description: "Programming Tridium Niagara, Siemens Desigo, and Schneider EBO building management system controllers.", difficultyLevel: 5 },
    { name: "Sensor Installation", tradeId: tradeMap["Controls/BMS Technician"], description: "Installing temperature, humidity, pressure, and airflow sensors with proper calibration and wiring.", difficultyLevel: 2 },
    { name: "EPMS Configuration", tradeId: tradeMap["Controls/BMS Technician"], description: "Configuring Electrical Power Monitoring Systems with power meters, CTs, and communication gateways.", difficultyLevel: 4 },
    { name: "PLC Programming", tradeId: tradeMap["Controls/BMS Technician"], description: "Programming Allen-Bradley, Siemens, and Schneider PLCs for generator paralleling and switchgear control.", difficultyLevel: 5 },
    { name: "Network Integration", tradeId: tradeMap["Controls/BMS Technician"], description: "Integrating BMS, EPMS, and DCIM systems over BACnet, Modbus, and SNMP protocols on converged networks.", difficultyLevel: 4 },

    // Welder (4)
    { name: "Structural Welding", tradeId: tradeMap["Welder"], description: "Performing structural steel welding per AWS D1.1 code including fillet, groove, and full-penetration welds.", difficultyLevel: 4 },
    { name: "Pipe Welding", tradeId: tradeMap["Welder"], description: "Welding carbon steel and stainless steel pipe in all positions (6G) for mechanical piping systems.", difficultyLevel: 5 },
    { name: "TIG/MIG Welding", tradeId: tradeMap["Welder"], description: "Performing GTAW and GMAW welding on various metals including stainless steel, carbon steel, and aluminum.", difficultyLevel: 3 },
    { name: "Weld Inspection Prep", tradeId: tradeMap["Welder"], description: "Preparing welded joints for visual, UT, and radiographic inspection per applicable codes.", difficultyLevel: 3 },

    // General Labor (4)
    { name: "Raised Floor Installation", tradeId: tradeMap["General Labor"], description: "Installing raised access floor systems including pedestals, stringers, and perforated tiles for data center white space.", difficultyLevel: 2 },
    { name: "Material Handling", tradeId: tradeMap["General Labor"], description: "Receiving, staging, and distributing construction materials and equipment using forklifts and pallet jacks.", difficultyLevel: 1 },
    { name: "Cable Tray Mounting", tradeId: tradeMap["General Labor"], description: "Installing cable tray supports, hangers, and trapeze systems for electrical and data cable routing.", difficultyLevel: 2 },
    { name: "Site Cleanup", tradeId: tradeMap["General Labor"], description: "Maintaining clean and organized work areas, debris removal, and construction waste management.", difficultyLevel: 1 },
  ];

  const createdSkills = await db.insert(skills).values(skillsData).returning();

  // Build skill lookup by trade
  const skillsByTrade: Record<string, typeof createdSkills> = {};
  for (const s of createdSkills) {
    const tradeName = Object.entries(tradeMap).find(([, id]) => id === s.tradeId)?.[0];
    if (tradeName) {
      if (!skillsByTrade[tradeName]) skillsByTrade[tradeName] = [];
      skillsByTrade[tradeName].push(s);
    }
  }

  // ── CERTIFICATIONS ──────────────────────────────────────────────────
  const createdCerts = await db.insert(certifications).values([
    { name: "OSHA 30", issuingBody: "OSHA / DOL", validityYears: 5, description: "30-hour Occupational Safety and Health Administration construction safety training for supervisors and foremen." },
    { name: "OSHA 10", issuingBody: "OSHA / DOL", validityYears: 5, description: "10-hour OSHA construction safety training covering hazard recognition for entry-level workers." },
    { name: "EPA 608 Universal", issuingBody: "EPA", validityYears: null, description: "EPA Section 608 Universal certification for handling all types of refrigerants in stationary equipment." },
    { name: "NFPA 70E", issuingBody: "NFPA", validityYears: 3, description: "Electrical safety in the workplace certification covering arc flash hazard analysis and safe work practices." },
    { name: "BICSI RCDD", issuingBody: "BICSI", validityYears: 3, description: "Registered Communications Distribution Designer certification for structured cabling system design." },
    { name: "First Aid/CPR", issuingBody: "American Red Cross", validityYears: 2, description: "Basic first aid and CPR/AED certification for workplace emergency response." },
    { name: "Confined Space Entry", issuingBody: "OSHA / DOL", validityYears: 1, description: "Training for safe entry and work in permit-required confined spaces per OSHA 29 CFR 1910.146." },
    { name: "NCCER Electrical", issuingBody: "NCCER", validityYears: null, description: "National Center for Construction Education and Research electrical craft certification at various levels." },
    { name: "Journeyman Electrician License", issuingBody: "State Licensing Board", validityYears: 3, description: "State-issued journeyman electrician license permitting independent electrical work under a master electrician." },
    { name: "Master Electrician License", issuingBody: "State Licensing Board", validityYears: 3, description: "State-issued master electrician license permitting supervision of electrical installations and pulling permits." },
    { name: "AWS Welding Cert", issuingBody: "American Welding Society", validityYears: 2, description: "AWS D1.1 structural steel welding certification covering SMAW, GMAW, FCAW, and GTAW processes." },
    { name: "Rigging/Signal Person", issuingBody: "NCCCO", validityYears: 5, description: "Qualified rigger and signal person certification for crane operations and heavy equipment lifts." },
    { name: "Forklift Operator", issuingBody: "OSHA / Employer", validityYears: 3, description: "Powered industrial truck operator certification per OSHA 29 CFR 1910.178." },
    { name: "LEED AP", issuingBody: "USGBC", validityYears: 2, description: "Leadership in Energy and Environmental Design Accredited Professional for sustainable building practices." },
    { name: "CompTIA Network+", issuingBody: "CompTIA", validityYears: 3, description: "Vendor-neutral networking certification covering infrastructure, operations, and security fundamentals." },
    { name: "NICET Fire Protection", issuingBody: "NICET", validityYears: 3, description: "National Institute for Certification in Engineering Technologies fire protection engineering certification." },
    { name: "Tridium Niagara Certification", issuingBody: "Tridium / Honeywell", validityYears: 2, description: "Certification for programming and configuring Tridium Niagara AX/N4 building automation framework." },
    { name: "ASHRAE Certification", issuingBody: "ASHRAE", validityYears: 3, description: "ASHRAE certification in HVAC design, operations, or building energy assessment for mechanical professionals." },
    { name: "NATE Certification", issuingBody: "NATE", validityYears: 2, description: "North American Technician Excellence certification for HVAC/R installation and service technicians." },
    { name: "R-410A Safety", issuingBody: "EPA", description: "Certification for safe handling and charging of R-410A refrigerant in modern HVAC systems." },
    { name: "UA Journeyman", issuingBody: "United Association", description: "United Association journeyman certification for pipefitters, plumbers, and steamfitters." },
    { name: "ASME B31.1/B31.3", issuingBody: "ASME", description: "Qualification under ASME pressure piping codes for power piping (B31.1) and process piping (B31.3)." },
    { name: "Backflow Prevention", issuingBody: "State/Local Authority", validityYears: 2, description: "Certification for installation and testing of backflow prevention assemblies in potable water systems." },
    { name: "BICSI Installer", issuingBody: "BICSI", validityYears: 3, description: "BICSI Installer certification for structured cabling installation, termination, and testing." },
    { name: "CompTIA A+", issuingBody: "CompTIA", validityYears: 3, description: "Vendor-neutral IT certification covering hardware, software, networking, and troubleshooting fundamentals." },
    { name: "Schneider/Siemens PLC Cert", issuingBody: "Schneider Electric / Siemens", validityYears: 2, description: "Manufacturer certification for programming and configuring Schneider or Siemens PLC controllers." },
    { name: "BMS Certification", issuingBody: "Various (Tridium/Honeywell/JCI)", validityYears: 3, description: "Certification in building management system programming, configuration, and integration." },
    { name: "ACI Flatwork Certification", issuingBody: "ACI", validityYears: 5, description: "American Concrete Institute flatwork finisher/technician certification for slab and floor construction." },
    { name: "AWS D1.1 Structural Welding", issuingBody: "American Welding Society", validityYears: 2, description: "AWS D1.1 structural steel welding code qualification for building and bridge construction." },
  ]).returning();

  const certMap: Record<string, string> = {};
  for (const c of createdCerts) {
    certMap[c.name] = c.id;
  }

  // ── TRADES ↔ CERTIFICATIONS ─────────────────────────────────────────
  await db.insert(tradesCertifications).values([
    // Electrician: Journeyman License, NFPA 70E, OSHA 10, OSHA 30, First Aid/CPR
    { tradeId: tradeMap["Electrician"], certificationId: certMap["Journeyman Electrician License"] },
    { tradeId: tradeMap["Electrician"], certificationId: certMap["NFPA 70E"] },
    { tradeId: tradeMap["Electrician"], certificationId: certMap["OSHA 10"] },
    { tradeId: tradeMap["Electrician"], certificationId: certMap["OSHA 30"] },
    { tradeId: tradeMap["Electrician"], certificationId: certMap["First Aid/CPR"] },
    // HVAC Technician: EPA 608 Universal, NATE Certification, OSHA 10, OSHA 30, R-410A Safety, First Aid/CPR
    { tradeId: tradeMap["HVAC Technician"], certificationId: certMap["EPA 608 Universal"] },
    { tradeId: tradeMap["HVAC Technician"], certificationId: certMap["NATE Certification"] },
    { tradeId: tradeMap["HVAC Technician"], certificationId: certMap["OSHA 10"] },
    { tradeId: tradeMap["HVAC Technician"], certificationId: certMap["OSHA 30"] },
    { tradeId: tradeMap["HVAC Technician"], certificationId: certMap["R-410A Safety"] },
    { tradeId: tradeMap["HVAC Technician"], certificationId: certMap["First Aid/CPR"] },
    // Plumber/Pipefitter: UA Journeyman, ASME B31.1/B31.3, OSHA 10, OSHA 30, First Aid/CPR
    { tradeId: tradeMap["Plumber/Pipefitter"], certificationId: certMap["UA Journeyman"] },
    { tradeId: tradeMap["Plumber/Pipefitter"], certificationId: certMap["ASME B31.1/B31.3"] },
    { tradeId: tradeMap["Plumber/Pipefitter"], certificationId: certMap["OSHA 10"] },
    { tradeId: tradeMap["Plumber/Pipefitter"], certificationId: certMap["OSHA 30"] },
    { tradeId: tradeMap["Plumber/Pipefitter"], certificationId: certMap["First Aid/CPR"] },
    // Structural Ironworker: AWS D1.1 Structural Welding, Rigging/Signal Person, OSHA 10, OSHA 30
    { tradeId: tradeMap["Structural Ironworker"], certificationId: certMap["AWS D1.1 Structural Welding"] },
    { tradeId: tradeMap["Structural Ironworker"], certificationId: certMap["Rigging/Signal Person"] },
    { tradeId: tradeMap["Structural Ironworker"], certificationId: certMap["OSHA 10"] },
    { tradeId: tradeMap["Structural Ironworker"], certificationId: certMap["OSHA 30"] },
    // Concrete Worker: ACI Flatwork Certification, OSHA 10, OSHA 30
    { tradeId: tradeMap["Concrete Worker"], certificationId: certMap["ACI Flatwork Certification"] },
    { tradeId: tradeMap["Concrete Worker"], certificationId: certMap["OSHA 10"] },
    { tradeId: tradeMap["Concrete Worker"], certificationId: certMap["OSHA 30"] },
    // Fire Protection Specialist: NICET Fire Protection, OSHA 10, OSHA 30, First Aid/CPR, Backflow Prevention
    { tradeId: tradeMap["Fire Protection Specialist"], certificationId: certMap["NICET Fire Protection"] },
    { tradeId: tradeMap["Fire Protection Specialist"], certificationId: certMap["OSHA 10"] },
    { tradeId: tradeMap["Fire Protection Specialist"], certificationId: certMap["OSHA 30"] },
    { tradeId: tradeMap["Fire Protection Specialist"], certificationId: certMap["First Aid/CPR"] },
    { tradeId: tradeMap["Fire Protection Specialist"], certificationId: certMap["Backflow Prevention"] },
    // Low Voltage Technician: BICSI Installer, CompTIA Network+, OSHA 10, First Aid/CPR
    { tradeId: tradeMap["Low Voltage Technician"], certificationId: certMap["BICSI Installer"] },
    { tradeId: tradeMap["Low Voltage Technician"], certificationId: certMap["CompTIA Network+"] },
    { tradeId: tradeMap["Low Voltage Technician"], certificationId: certMap["OSHA 10"] },
    { tradeId: tradeMap["Low Voltage Technician"], certificationId: certMap["First Aid/CPR"] },
    // Mechanical Insulator (unchanged)
    { tradeId: tradeMap["Mechanical Insulator"], certificationId: certMap["OSHA 10"] },
    { tradeId: tradeMap["Mechanical Insulator"], certificationId: certMap["OSHA 30"] },
    { tradeId: tradeMap["Mechanical Insulator"], certificationId: certMap["Confined Space Entry"] },
    { tradeId: tradeMap["Mechanical Insulator"], certificationId: certMap["First Aid/CPR"] },
    // Sheet Metal Worker (unchanged)
    { tradeId: tradeMap["Sheet Metal Worker"], certificationId: certMap["OSHA 10"] },
    { tradeId: tradeMap["Sheet Metal Worker"], certificationId: certMap["OSHA 30"] },
    { tradeId: tradeMap["Sheet Metal Worker"], certificationId: certMap["Forklift Operator"] },
    { tradeId: tradeMap["Sheet Metal Worker"], certificationId: certMap["First Aid/CPR"] },
    // Controls/BMS Technician: CompTIA A+, Schneider/Siemens PLC Cert, OSHA 10, BMS Certification
    { tradeId: tradeMap["Controls/BMS Technician"], certificationId: certMap["CompTIA A+"] },
    { tradeId: tradeMap["Controls/BMS Technician"], certificationId: certMap["Schneider/Siemens PLC Cert"] },
    { tradeId: tradeMap["Controls/BMS Technician"], certificationId: certMap["OSHA 10"] },
    { tradeId: tradeMap["Controls/BMS Technician"], certificationId: certMap["BMS Certification"] },
    // Welder: AWS D1.1 Structural Welding, AWS Welding Cert, OSHA 10, OSHA 30
    { tradeId: tradeMap["Welder"], certificationId: certMap["AWS D1.1 Structural Welding"] },
    { tradeId: tradeMap["Welder"], certificationId: certMap["AWS Welding Cert"] },
    { tradeId: tradeMap["Welder"], certificationId: certMap["OSHA 10"] },
    { tradeId: tradeMap["Welder"], certificationId: certMap["OSHA 30"] },
    // General Labor: OSHA 10, First Aid/CPR, Forklift Operator
    { tradeId: tradeMap["General Labor"], certificationId: certMap["OSHA 10"] },
    { tradeId: tradeMap["General Labor"], certificationId: certMap["First Aid/CPR"] },
    { tradeId: tradeMap["General Labor"], certificationId: certMap["Forklift Operator"] },
  ]);

  // ── PROJECT PHASES ──────────────────────────────────────────────────
  const createdPhases = await db.insert(projectPhases).values([
    { name: "Site Preparation", description: "Clearing, grading, erosion control, temporary utilities, and construction access roads.", orderIndex: 1 },
    { name: "Foundation & Structural", description: "Concrete foundations, structural steel erection, metal decking, and building envelope.", orderIndex: 2 },
    { name: "Electrical Rough-In", description: "Main power distribution, conduit runs, cable tray, grounding, and transformer placement.", orderIndex: 3 },
    { name: "Mechanical/HVAC Install", description: "Chiller plant, CRAH/CRAC units, ductwork, piping, and cooling tower assembly.", orderIndex: 4 },
    { name: "Plumbing & Fire Protection", description: "Chilled water piping, drainage, fire suppression systems, and sprinkler installation.", orderIndex: 5 },
    { name: "Low Voltage & Cabling", description: "Structured cabling, fiber optics, cable tray, network racks, and pathway infrastructure.", orderIndex: 6 },
    { name: "Controls & BMS Integration", description: "BMS programming, sensor installation, EPMS configuration, and system integration.", orderIndex: 7 },
    { name: "Testing & Commissioning", description: "Integrated systems testing, load bank testing, IST procedures, and performance verification.", orderIndex: 8 },
    { name: "Punch List & Closeout", description: "Deficiency correction, final inspections, as-built documentation, and owner training.", orderIndex: 9 },
  ]).returning();

  const phaseMap: Record<string, string> = {};
  for (const p of createdPhases) {
    phaseMap[p.name] = p.id;
  }

  // ── PROJECT PHASES ↔ TRADES ─────────────────────────────────────────
  await db.insert(projectPhasesTrades).values([
    // Site Preparation
    { projectPhaseId: phaseMap["Site Preparation"], tradeId: tradeMap["Concrete Worker"], requiredWorkerCount: 8 },
    { projectPhaseId: phaseMap["Site Preparation"], tradeId: tradeMap["Structural Ironworker"], requiredWorkerCount: 4 },
    // Foundation & Structural
    { projectPhaseId: phaseMap["Foundation & Structural"], tradeId: tradeMap["Concrete Worker"], requiredWorkerCount: 12 },
    { projectPhaseId: phaseMap["Foundation & Structural"], tradeId: tradeMap["Structural Ironworker"], requiredWorkerCount: 10 },
    { projectPhaseId: phaseMap["Foundation & Structural"], tradeId: tradeMap["Electrician"], requiredWorkerCount: 4 },
    // Electrical Rough-In
    { projectPhaseId: phaseMap["Electrical Rough-In"], tradeId: tradeMap["Electrician"], requiredWorkerCount: 20 },
    { projectPhaseId: phaseMap["Electrical Rough-In"], tradeId: tradeMap["Low Voltage Technician"], requiredWorkerCount: 6 },
    // Mechanical/HVAC Install
    { projectPhaseId: phaseMap["Mechanical/HVAC Install"], tradeId: tradeMap["HVAC Technician"], requiredWorkerCount: 15 },
    { projectPhaseId: phaseMap["Mechanical/HVAC Install"], tradeId: tradeMap["Sheet Metal Worker"], requiredWorkerCount: 8 },
    { projectPhaseId: phaseMap["Mechanical/HVAC Install"], tradeId: tradeMap["Mechanical Insulator"], requiredWorkerCount: 6 },
    { projectPhaseId: phaseMap["Mechanical/HVAC Install"], tradeId: tradeMap["Plumber/Pipefitter"], requiredWorkerCount: 10 },
    // Plumbing & Fire Protection
    { projectPhaseId: phaseMap["Plumbing & Fire Protection"], tradeId: tradeMap["Plumber/Pipefitter"], requiredWorkerCount: 12 },
    { projectPhaseId: phaseMap["Plumbing & Fire Protection"], tradeId: tradeMap["Fire Protection Specialist"], requiredWorkerCount: 8 },
    // Low Voltage & Cabling
    { projectPhaseId: phaseMap["Low Voltage & Cabling"], tradeId: tradeMap["Low Voltage Technician"], requiredWorkerCount: 16 },
    { projectPhaseId: phaseMap["Low Voltage & Cabling"], tradeId: tradeMap["Electrician"], requiredWorkerCount: 4 },
    // Controls & BMS Integration
    { projectPhaseId: phaseMap["Controls & BMS Integration"], tradeId: tradeMap["Controls/BMS Technician"], requiredWorkerCount: 8 },
    { projectPhaseId: phaseMap["Controls & BMS Integration"], tradeId: tradeMap["Electrician"], requiredWorkerCount: 4 },
    { projectPhaseId: phaseMap["Controls & BMS Integration"], tradeId: tradeMap["HVAC Technician"], requiredWorkerCount: 3 },
    // Testing & Commissioning
    { projectPhaseId: phaseMap["Testing & Commissioning"], tradeId: tradeMap["Electrician"], requiredWorkerCount: 10 },
    { projectPhaseId: phaseMap["Testing & Commissioning"], tradeId: tradeMap["HVAC Technician"], requiredWorkerCount: 6 },
    { projectPhaseId: phaseMap["Testing & Commissioning"], tradeId: tradeMap["Controls/BMS Technician"], requiredWorkerCount: 6 },
    { projectPhaseId: phaseMap["Testing & Commissioning"], tradeId: tradeMap["Fire Protection Specialist"], requiredWorkerCount: 3 },
    { projectPhaseId: phaseMap["Testing & Commissioning"], tradeId: tradeMap["Low Voltage Technician"], requiredWorkerCount: 4 },
    // Punch List & Closeout
    { projectPhaseId: phaseMap["Punch List & Closeout"], tradeId: tradeMap["Electrician"], requiredWorkerCount: 6 },
    { projectPhaseId: phaseMap["Punch List & Closeout"], tradeId: tradeMap["HVAC Technician"], requiredWorkerCount: 4 },
    { projectPhaseId: phaseMap["Punch List & Closeout"], tradeId: tradeMap["Low Voltage Technician"], requiredWorkerCount: 4 },
    { projectPhaseId: phaseMap["Punch List & Closeout"], tradeId: tradeMap["Controls/BMS Technician"], requiredWorkerCount: 2 },
    { projectPhaseId: phaseMap["Punch List & Closeout"], tradeId: tradeMap["Fire Protection Specialist"], requiredWorkerCount: 2 },
  ]);

  // ── WORKER ↔ SKILLS & CERTIFICATIONS ────────────────────────────────
  // Map existing worker trades to ontology trades
  const workerTradeMapping: Record<string, string> = {
    "Electrician": "Electrician",
    "HVAC Technician": "HVAC Technician",
    "Pipefitter": "Plumber/Pipefitter",
    "Plumber": "Plumber/Pipefitter",
    "Structural Ironworker": "Structural Ironworker",
    "Concrete Specialist": "Concrete Worker",
    "Fire Protection": "Fire Protection Specialist",
    "Network Technician": "Low Voltage Technician",
    "Controls Technician": "Controls/BMS Technician",
    "Welder": "Welder",
    "General Labor": "General Labor",
  };

  // Map existing worker cert strings to ontology cert names
  const certNameMapping: Record<string, string> = {
    "Master Electrician": "Master Electrician License",
    "Journeyman Electrician": "Journeyman Electrician License",
    "Journeyman Pipefitter": "OSHA 30",
    "Journeyman Plumber": "OSHA 10",
    "OSHA 30": "OSHA 30",
    "OSHA 10": "OSHA 10",
    "NFPA 70E": "NFPA 70E",
    "EPA 608 Universal": "EPA 608 Universal",
    "First Aid/CPR": "First Aid/CPR",
    "BICSI RCDD": "BICSI RCDD",
    "LEED AP": "LEED AP",
    "AWS D1.1 Certified": "AWS Welding Cert",
    "ACI Concrete Finisher": "OSHA 30",
    "NICET Level III": "NICET Fire Protection",
    "NICET Level II": "NICET Fire Protection",
    "NCCCO Crane Operator": "Rigging/Signal Person",
    "Rigging Signal Person": "Rigging/Signal Person",
    "Forklift Certified": "Forklift Operator",
    "Confined Space Entry": "Confined Space Entry",
    "ASHRAE Certified": "ASHRAE Certification",
    "Tridium Niagara AX": "Tridium Niagara Certification",
  };

  const allWorkers = await db.select().from(workers);
  const workerSkillRows: { workerId: string; skillId: string; proficiencyLevel: number }[] = [];
  const workerCertRows: { workerId: string; certificationId: string; earnedDate: string; expiryDate: string | null }[] = [];

  for (const w of allWorkers) {
    // Assign skills if worker's trade maps to an ontology trade
    const ontologyTrade = workerTradeMapping[w.trade];
    if (ontologyTrade && skillsByTrade[ontologyTrade]) {
      const tradeSkills = skillsByTrade[ontologyTrade];
      for (const skill of tradeSkills) {
        // Proficiency based on experience: more years → higher proficiency
        let proficiency: number;
        if (w.experience >= 12) proficiency = 5;
        else if (w.experience >= 9) proficiency = 4;
        else if (w.experience >= 6) proficiency = 3;
        else if (w.experience >= 3) proficiency = 2;
        else proficiency = 1;
        // Reduce proficiency for harder skills by 1 (min 1)
        if (skill.difficultyLevel >= 5) proficiency = Math.max(1, proficiency - 1);
        workerSkillRows.push({ workerId: w.id, skillId: skill.id, proficiencyLevel: proficiency });
      }
    }

    // Assign certifications from worker's existing cert strings
    if (w.certifications && w.certifications.length > 0) {
      const assignedCertIds = new Set<string>();
      for (const certStr of w.certifications) {
        const mappedCertName = certNameMapping[certStr];
        if (mappedCertName && certMap[mappedCertName] && !assignedCertIds.has(certMap[mappedCertName])) {
          assignedCertIds.add(certMap[mappedCertName]);
          // Earned date based on experience (years ago)
          const yearsAgo = Math.min(w.experience, Math.floor(Math.random() * w.experience) + 1);
          const earnedYear = 2026 - yearsAgo;
          const earnedDate = `${earnedYear}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, "0")}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, "0")}`;
          // Expiry date based on cert validity
          const certRecord = createdCerts.find(c => c.name === mappedCertName);
          let expiryDate: string | null = null;
          if (certRecord?.validityYears) {
            const expiryYear = earnedYear + certRecord.validityYears;
            expiryDate = `${expiryYear}-${earnedDate.slice(5)}`;
          }
          workerCertRows.push({ workerId: w.id, certificationId: certMap[mappedCertName], earnedDate, expiryDate });
        }
      }
    }
  }

  if (workerSkillRows.length > 0) {
    await db.insert(workerSkills).values(workerSkillRows);
  }
  if (workerCertRows.length > 0) {
    await db.insert(workerCertifications).values(workerCertRows);
  }

  console.log(`Ontology seeded: ${createdTrades.length} trades, ${createdSkills.length} skills, ${createdCerts.length} certifications, ${createdPhases.length} phases`);
  console.log(`Linked: ${workerSkillRows.length} worker-skills, ${workerCertRows.length} worker-certifications`);
}
