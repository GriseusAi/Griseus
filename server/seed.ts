import { db } from "./db";
import { workers, projects, workOrders, projectAssignments, chatMessages } from "@shared/schema";

export async function seedDatabase() {
  const existingProjects = await db.select().from(projects);
  if (existingProjects.length > 0) return;

  const createdWorkers = await db.insert(workers).values([
    // --- Electricians ---
    {
      name: "Marcus Rivera",
      title: "Senior Electrician",
      trade: "Electrician",
      email: "marcus.rivera84@gmail.com",
      phone: "+1 (602) 318-4729",
      location: "Phoenix, AZ",
      experience: 14,
      certifications: ["Master Electrician", "OSHA 30", "NFPA 70E", "Siemens High Voltage Certified", "Arc Flash Safety"],
      available: true,
      bio: "Specialized in high-voltage power distribution systems for Tier III and IV data centers. Led electrical teams on 12+ hyperscale builds.",
      walletBalance: 125000,
      pendingPayout: 45000,
      totalHoursWorked: 1847,
    },
    {
      name: "Darnell Washington",
      title: "Journeyman Electrician",
      trade: "Electrician",
      email: "dwashington.elec@yahoo.com",
      phone: "+1 (614) 482-7163",
      location: "Columbus, OH",
      experience: 8,
      certifications: ["Journeyman Electrician", "OSHA 10", "NFPA 70E", "First Aid/CPR"],
      available: true,
      bio: "Experienced in medium-voltage switchgear installation and commissioning. Strong background in data center power distribution.",
      walletBalance: 67400,
      pendingPayout: 22000,
      totalHoursWorked: 1120,
    },
    {
      name: "Travis McCoy",
      title: "Electrical Foreman",
      trade: "Electrician",
      email: "travis.mccoy77@outlook.com",
      phone: "+1 (702) 914-3852",
      location: "Las Vegas, NV",
      experience: 16,
      certifications: ["Master Electrician", "OSHA 30", "NFPA 70E", "Arc Flash Safety", "Eaton Certified"],
      available: false,
      bio: "Leads electrical crews on large-scale data center builds. Expert in paralleling switchgear and automatic transfer switch systems.",
      walletBalance: 142000,
      pendingPayout: 51000,
      totalHoursWorked: 2210,
    },
    {
      name: "Angela Patterson",
      title: "Electrician",
      trade: "Electrician",
      email: "apatterson.work@gmail.com",
      phone: "+1 (571) 206-8431",
      location: "Ashburn, VA",
      experience: 6,
      certifications: ["Journeyman Electrician", "OSHA 10", "NFPA 70E", "Schneider Electric Certified"],
      available: true,
      bio: "Focused on UPS systems and battery plant installations. Completed work on 5 data center projects in Northern Virginia.",
      walletBalance: 48200,
      pendingPayout: 15000,
      totalHoursWorked: 780,
    },
    // --- HVAC Technicians ---
    {
      name: "Sarah Chen",
      title: "HVAC Lead",
      trade: "HVAC Technician",
      email: "sarah.chen.hvac@gmail.com",
      phone: "+1 (972) 641-0358",
      location: "Dallas, TX",
      experience: 11,
      certifications: ["EPA 608 Universal", "ASHRAE Certified", "LEED AP", "Carrier Chiller Specialist", "BMS Controls Pro"],
      available: false,
      bio: "Expert in precision cooling systems and hot/cold aisle containment for high-density compute environments.",
      walletBalance: 89500,
      pendingPayout: 32000,
      totalHoursWorked: 1420,
    },
    {
      name: "Miguel Torres",
      title: "HVAC Technician",
      trade: "HVAC Technician",
      email: "m.torres.hvac@yahoo.com",
      phone: "+1 (210) 753-4291",
      location: "San Antonio, TX",
      experience: 7,
      certifications: ["EPA 608 Universal", "OSHA 10", "Trane Certified", "Refrigeration Systems"],
      available: true,
      bio: "Specializes in chiller plant operations and cooling tower maintenance for mission-critical facilities.",
      walletBalance: 52300,
      pendingPayout: 18500,
      totalHoursWorked: 890,
    },
    {
      name: "Brittany Daniels",
      title: "Senior HVAC Technician",
      trade: "HVAC Technician",
      email: "brittany.daniels@outlook.com",
      phone: "+1 (404) 829-6174",
      location: "Atlanta, GA",
      experience: 12,
      certifications: ["EPA 608 Universal", "ASHRAE Certified", "Liebert Certified", "OSHA 30", "BMS Integration Specialist"],
      available: true,
      bio: "Designs and commissions precision air handling systems for Tier III+ data centers. Expert in rear-door heat exchangers and in-row cooling.",
      walletBalance: 95800,
      pendingPayout: 34000,
      totalHoursWorked: 1580,
    },
    {
      name: "Derrick Holmes",
      title: "HVAC Mechanic",
      trade: "HVAC Technician",
      email: "derrick.holmes92@gmail.com",
      phone: "+1 (775) 348-5920",
      location: "Reno, NV",
      experience: 5,
      certifications: ["EPA 608 Universal", "OSHA 10", "Daikin Certified"],
      available: true,
      bio: "Focused on evaporative cooling systems and free-cooling economizer setups for arid climate data centers.",
      walletBalance: 31500,
      pendingPayout: 9800,
      totalHoursWorked: 620,
    },
    // --- Project Managers ---
    {
      name: "James Okafor",
      title: "Senior Project Manager",
      trade: "Project Manager",
      email: "james.okafor.pm@gmail.com",
      phone: "+1 (703) 462-8107",
      location: "Ashburn, VA",
      experience: 18,
      certifications: ["PMP", "CDCMP", "Six Sigma Black Belt", "OSHA 500 Trainer", "Uptime Institute ATD"],
      available: true,
      bio: "Managed construction of 8 data centers across North America totaling over 200MW of critical IT capacity.",
      walletBalance: 215000,
      pendingPayout: 78000,
      totalHoursWorked: 2640,
    },
    {
      name: "Linda Nguyen",
      title: "Project Manager",
      trade: "Project Manager",
      email: "l.nguyen.projects@yahoo.com",
      phone: "+1 (503) 217-6843",
      location: "Hillsboro, OR",
      experience: 10,
      certifications: ["PMP", "CDCMP", "OSHA 30", "Lean Construction"],
      available: false,
      bio: "Manages multi-phase data center construction projects in the Pacific Northwest. Strong track record of on-time delivery.",
      walletBalance: 128000,
      pendingPayout: 42000,
      totalHoursWorked: 1780,
    },
    // --- Network Technicians ---
    {
      name: "Elena Vasquez",
      title: "Network Infrastructure Engineer",
      trade: "Network Technician",
      email: "elena.vasquez.net@gmail.com",
      phone: "+1 (503) 694-2718",
      location: "Hillsboro, OR",
      experience: 9,
      certifications: ["BICSI RCDD", "Cisco CCNP", "CDCDP", "Fiber Optic Pro", "Corning Certified Installer"],
      available: true,
      bio: "Designs and deploys structured cabling and fiber optic infrastructure for hyperscale campus environments.",
      walletBalance: 64200,
      pendingPayout: 18500,
      totalHoursWorked: 960,
    },
    {
      name: "Tyrone Brooks",
      title: "Fiber Optic Technician",
      trade: "Network Technician",
      email: "tyrone.brooks@outlook.com",
      phone: "+1 (614) 873-5042",
      location: "Dublin, OH",
      experience: 6,
      certifications: ["BICSI Installer 2", "Fiber Optic Pro", "OSHA 10", "CommScope Certified"],
      available: true,
      bio: "Specializes in high-count fiber optic splicing and testing for data center interconnects and campus backbones.",
      walletBalance: 41700,
      pendingPayout: 13200,
      totalHoursWorked: 740,
    },
    {
      name: "Kendra Lawson",
      title: "Network Cabling Lead",
      trade: "Network Technician",
      email: "kendra.lawson88@yahoo.com",
      phone: "+1 (770) 529-4186",
      location: "Marietta, GA",
      experience: 8,
      certifications: ["BICSI RCDD", "CDCDP", "Panduit Certified", "OSHA 10"],
      available: true,
      bio: "Leads structured cabling teams on hyperscale builds. Expert in overhead cable tray routing and hot-aisle containment cable management.",
      walletBalance: 58900,
      pendingPayout: 20100,
      totalHoursWorked: 1050,
    },
    // --- Facility Engineers ---
    {
      name: "Robert Kim",
      title: "Senior Facility Engineer",
      trade: "Facility Engineer",
      email: "robert.kim.eng@outlook.com",
      phone: "+1 (408) 731-9264",
      location: "Santa Clara, CA",
      experience: 15,
      certifications: ["CDCEP", "AEE CEM", "Uptime Tier Designer", "Schneider Electric Certified", "Generator Systems Pro"],
      available: false,
      bio: "Oversees critical infrastructure operations including UPS, generators, and BMS for multi-site portfolios.",
      walletBalance: 178300,
      pendingPayout: 52000,
      totalHoursWorked: 2180,
    },
    {
      name: "Patricia Hayes",
      title: "Facility Engineer",
      trade: "Facility Engineer",
      email: "p.hayes.facility@gmail.com",
      phone: "+1 (804) 362-7491",
      location: "Richmond, VA",
      experience: 9,
      certifications: ["CDCEP", "OSHA 30", "Uptime Institute ATD", "BMS Controls"],
      available: true,
      bio: "Manages day-to-day operations of critical power and cooling infrastructure. Strong background in preventive maintenance programs.",
      walletBalance: 72100,
      pendingPayout: 25000,
      totalHoursWorked: 1180,
    },
    // --- Plumbers / Pipefitters ---
    {
      name: "Carlos Mendez",
      title: "Pipefitter Foreman",
      trade: "Pipefitter",
      email: "carlos.mendez.pipe@yahoo.com",
      phone: "+1 (210) 847-3196",
      location: "San Antonio, TX",
      experience: 13,
      certifications: ["Journeyman Pipefitter", "OSHA 30", "ASME B31.9", "Medical Gas Certified", "Backflow Prevention"],
      available: true,
      bio: "Expert in chilled water piping systems and glycol loops for data center cooling plants. Manages pipefitting crews on large mechanical installs.",
      walletBalance: 104500,
      pendingPayout: 38000,
      totalHoursWorked: 1720,
    },
    {
      name: "Tommy Sullivan",
      title: "Plumber",
      trade: "Plumber",
      email: "tommy.sull@gmail.com",
      phone: "+1 (614) 593-8274",
      location: "New Albany, OH",
      experience: 7,
      certifications: ["Journeyman Plumber", "OSHA 10", "Backflow Prevention", "Med Gas Installer"],
      available: true,
      bio: "Handles all plumbing and drainage systems for data center builds including condensate lines and fire suppression piping support.",
      walletBalance: 45800,
      pendingPayout: 14200,
      totalHoursWorked: 830,
    },
    // --- Welders ---
    {
      name: "Jake Hernandez",
      title: "Certified Welder",
      trade: "Welder",
      email: "jake.hernandez.weld@outlook.com",
      phone: "+1 (972) 406-1853",
      location: "Dallas, TX",
      experience: 10,
      certifications: ["AWS D1.1 Certified", "OSHA 10", "6G Pipe Welding", "TIG/MIG Certified"],
      available: true,
      bio: "Performs structural and pipe welding for data center steel erection and mechanical systems. Certified in all positions.",
      walletBalance: 76200,
      pendingPayout: 27500,
      totalHoursWorked: 1340,
    },
    {
      name: "Samantha Reed",
      title: "Welder/Fitter",
      trade: "Welder",
      email: "sam.reed.welds@gmail.com",
      phone: "+1 (702) 583-4017",
      location: "Las Vegas, NV",
      experience: 6,
      certifications: ["AWS D1.1 Certified", "OSHA 10", "Stick/TIG Certified"],
      available: true,
      bio: "Specializes in stainless steel and carbon steel welding for mechanical piping systems in mission-critical facilities.",
      walletBalance: 38900,
      pendingPayout: 11500,
      totalHoursWorked: 680,
    },
    // --- Fire Protection ---
    {
      name: "Keith Morrison",
      title: "Fire Protection Technician",
      trade: "Fire Protection",
      email: "keith.morrison.fp@yahoo.com",
      phone: "+1 (571) 842-6309",
      location: "Manassas, VA",
      experience: 11,
      certifications: ["NICET Level III", "OSHA 30", "FM-200 Certified", "Novec 1230 Certified", "Fire Alarm Designer"],
      available: true,
      bio: "Designs and installs clean agent fire suppression systems for data centers. Expert in VESDA early detection systems.",
      walletBalance: 87600,
      pendingPayout: 29000,
      totalHoursWorked: 1450,
    },
    {
      name: "Dana Pearson",
      title: "Sprinkler Fitter",
      trade: "Fire Protection",
      email: "dana.pearson.fire@outlook.com",
      phone: "+1 (404) 631-7248",
      location: "Atlanta, GA",
      experience: 8,
      certifications: ["NICET Level II", "OSHA 10", "Pre-action Systems", "Backflow Certified"],
      available: false,
      bio: "Installs and services pre-action sprinkler systems and dry pipe systems for data center white space and support areas.",
      walletBalance: 55200,
      pendingPayout: 17800,
      totalHoursWorked: 940,
    },
    // --- Controls Technicians ---
    {
      name: "Victor Pham",
      title: "Controls Engineer",
      trade: "Controls Technician",
      email: "victor.pham.ctrl@gmail.com",
      phone: "+1 (503) 278-4631",
      location: "Portland, OR",
      experience: 9,
      certifications: ["Tridium Niagara AX", "Schneider BMS", "OSHA 10", "Siemens Desigo", "PLC Programming"],
      available: true,
      bio: "Programs and commissions building management systems and EPMS for data centers. Integrates HVAC, power, and security controls.",
      walletBalance: 71400,
      pendingPayout: 23500,
      totalHoursWorked: 1090,
    },
    // --- General Labor / Riggers ---
    {
      name: "DeShawn Carter",
      title: "Rigger / Equipment Operator",
      trade: "Rigger",
      email: "deshawn.carter@yahoo.com",
      phone: "+1 (614) 745-2389",
      location: "Columbus, OH",
      experience: 8,
      certifications: ["NCCCO Crane Operator", "OSHA 30", "Rigging Signal Person", "Forklift Certified"],
      available: true,
      bio: "Handles heavy equipment placement including generators, transformers, and chillers for data center builds.",
      walletBalance: 62300,
      pendingPayout: 21000,
      totalHoursWorked: 1080,
    },
    {
      name: "Maria Gutierrez",
      title: "General Labor Lead",
      trade: "General Labor",
      email: "maria.gutierrez.work@outlook.com",
      phone: "+1 (775) 491-8356",
      location: "Reno, NV",
      experience: 5,
      certifications: ["OSHA 10", "Forklift Certified", "First Aid/CPR", "Confined Space Entry"],
      available: true,
      bio: "Leads general labor crews for raised floor installation, cable tray mounting, and site cleanup on data center projects.",
      walletBalance: 29400,
      pendingPayout: 8700,
      totalHoursWorked: 580,
    },
    {
      name: "Brian Foster",
      title: "Laborer",
      trade: "General Labor",
      email: "brian.foster91@gmail.com",
      phone: "+1 (770) 362-9417",
      location: "Atlanta, GA",
      experience: 3,
      certifications: ["OSHA 10", "First Aid/CPR"],
      available: true,
      bio: "Reliable general laborer with experience in data center raised floor installation and material handling.",
      walletBalance: 18200,
      pendingPayout: 5400,
      totalHoursWorked: 380,
    },
    // --- Security Systems ---
    {
      name: "Nathan Cole",
      title: "Security Systems Installer",
      trade: "Security Systems",
      email: "nathan.cole.sec@yahoo.com",
      phone: "+1 (972) 813-6274",
      location: "Fort Worth, TX",
      experience: 7,
      certifications: ["ESA/NTS Certified", "OSHA 10", "Lenel Certified", "Genetec Certified", "Low Voltage License"],
      available: true,
      bio: "Installs and configures access control, CCTV, and intrusion detection systems for data center physical security.",
      walletBalance: 49800,
      pendingPayout: 16300,
      totalHoursWorked: 860,
    },
    // --- Concrete / Structural ---
    {
      name: "Raymond Voss",
      title: "Concrete Foreman",
      trade: "Concrete Specialist",
      email: "raymond.voss@outlook.com",
      phone: "+1 (702) 647-3582",
      location: "Henderson, NV",
      experience: 14,
      certifications: ["ACI Concrete Finisher", "OSHA 30", "ACI Flatwork Technician", "Post-Tension Certified"],
      available: false,
      bio: "Oversees structural concrete work for data center foundations, pads, and elevated slabs. Expert in high-load floor systems.",
      walletBalance: 108700,
      pendingPayout: 39500,
      totalHoursWorked: 1890,
    },
    {
      name: "Jasmine Powell",
      title: "Ironworker",
      trade: "Structural Ironworker",
      email: "jasmine.powell.iron@gmail.com",
      phone: "+1 (210) 924-7138",
      location: "San Antonio, TX",
      experience: 9,
      certifications: ["AWS D1.1 Certified", "OSHA 30", "Structural Steel Erection", "Fall Protection Competent Person"],
      available: true,
      bio: "Erects structural steel and metal decking for data center shells. Experienced with pre-engineered metal building systems.",
      walletBalance: 69400,
      pendingPayout: 24600,
      totalHoursWorked: 1160,
    },
  ]).returning();

  const createdProjects = await db.insert(projects).values([
    // 1. Ashburn, VA - Data Center Alley
    {
      name: "Ashburn Data Hall Expansion",
      client: "Atlantic Data Systems",
      location: "Ashburn, VA",
      status: "active",
      description: "Expansion of existing campus with two additional data halls. Includes upgraded power distribution and enhanced cooling capacity.",
      startDate: "2025-09-01",
      endDate: "2027-06-30",
      progress: 38,
      powerCapacity: "40MW",
      tier: "tier_4",
      latitude: 39.0438,
      longitude: -77.4874,
      tradesNeeded: ["Electrician", "Project Manager", "Facility Engineer", "Fire Protection"],
      hourlyRate: "$60-95/hr",
    },
    // 2. Dallas, TX
    {
      name: "Dallas Metro Edge Campus",
      client: "NexGen Digital",
      location: "Dallas, TX",
      status: "active",
      description: "Edge computing campus with three interconnected facilities. Focus on low-latency connectivity and renewable energy integration.",
      startDate: "2025-06-15",
      endDate: "2026-08-30",
      progress: 68,
      powerCapacity: "25MW",
      tier: "tier_3",
      latitude: 32.7767,
      longitude: -96.7970,
      tradesNeeded: ["HVAC Technician", "Network Technician", "Fire Protection", "Welder"],
      hourlyRate: "$50-80/hr",
    },
    // 3. Phoenix, AZ
    {
      name: "Phoenix Hyperscale DC-3",
      client: "CloudPeak Technologies",
      location: "Phoenix, AZ",
      status: "active",
      description: "New 60MW hyperscale data center with advanced liquid cooling infrastructure. Tier IV design with 2N redundancy on all critical systems.",
      startDate: "2025-09-01",
      endDate: "2026-12-15",
      progress: 42,
      powerCapacity: "60MW",
      tier: "tier_4",
      latitude: 33.4484,
      longitude: -112.0740,
      tradesNeeded: ["Electrician", "HVAC Technician", "General Labor", "Pipefitter"],
      hourlyRate: "$55-90/hr",
    },
    // 4. Hillsboro, OR - Silicon Forest
    {
      name: "Hillsboro Network Hub",
      client: "Pacific Fiber Corp",
      location: "Hillsboro, OR",
      status: "completed",
      description: "High-density network interconnection facility with carrier-neutral meet-me rooms and 100G fabric throughout.",
      startDate: "2024-11-01",
      endDate: "2025-10-15",
      progress: 100,
      powerCapacity: "15MW",
      tier: "tier_3",
      latitude: 45.5231,
      longitude: -122.9898,
      tradesNeeded: ["Network Technician"],
      hourlyRate: "$45-70/hr",
    },
    // 5. Columbus, OH
    {
      name: "Columbus Cloud Core Facility",
      client: "MidWest Cloud Partners",
      location: "Columbus, OH",
      status: "active",
      description: "Multi-tenant colocation facility with high-density compute zones and direct fiber access to regional IX.",
      startDate: "2025-08-01",
      endDate: "2026-11-30",
      progress: 51,
      powerCapacity: "35MW",
      tier: "tier_3",
      latitude: 39.9612,
      longitude: -82.9988,
      tradesNeeded: ["Electrician", "HVAC Technician", "Network Technician", "General Labor"],
      hourlyRate: "$50-80/hr",
    },
    // 6. Atlanta, GA
    {
      name: "Atlanta Peachtree Data Campus",
      client: "SouthPoint Infrastructure",
      location: "Atlanta, GA",
      status: "active",
      description: "56MW campus supporting enterprise cloud and content delivery workloads. Features N+1 cooling with water-side economizers.",
      startDate: "2025-07-15",
      endDate: "2026-10-30",
      progress: 55,
      powerCapacity: "56MW",
      tier: "tier_3",
      latitude: 33.7490,
      longitude: -84.3880,
      tradesNeeded: ["Electrician", "HVAC Technician", "Fire Protection", "Rigger"],
      hourlyRate: "$50-80/hr",
    },
    // 7. Las Vegas, NV
    {
      name: "Las Vegas Switch Citadel Phase II",
      client: "Desert Digital Holdings",
      location: "Las Vegas, NV",
      status: "active",
      description: "Phase II expansion of a 1M sqft mega data center campus. Includes new power substation and water reclamation system.",
      startDate: "2025-10-01",
      endDate: "2027-03-31",
      progress: 22,
      powerCapacity: "100MW",
      tier: "tier_4",
      latitude: 36.1699,
      longitude: -115.1398,
      tradesNeeded: ["Electrician", "HVAC Technician", "Concrete Specialist", "Welder", "Pipefitter"],
      hourlyRate: "$60-95/hr",
    },
    // 8. San Antonio, TX
    {
      name: "San Antonio Southside DC",
      client: "Lone Star Compute",
      location: "San Antonio, TX",
      status: "planning",
      description: "Government-adjacent data center designed for FedRAMP and ITAR compliance. Enhanced physical security and isolated power feeds.",
      startDate: "2026-04-01",
      endDate: "2027-09-30",
      progress: 5,
      powerCapacity: "30MW",
      tier: "tier_4",
      latitude: 29.4241,
      longitude: -98.4936,
      tradesNeeded: ["Electrician", "Security Systems", "Fire Protection", "Structural Ironworker"],
      hourlyRate: "$55-85/hr",
    },
    // 9. Manassas, VA
    {
      name: "Manassas Enterprise Vault",
      client: "Iron Mountain Data Centers",
      location: "Manassas, VA",
      status: "active",
      description: "Underground data center facility in converted limestone mine. Focus on physical security and energy efficiency.",
      startDate: "2025-05-01",
      endDate: "2026-07-30",
      progress: 72,
      powerCapacity: "20MW",
      tier: "tier_3",
      latitude: 38.7509,
      longitude: -77.4753,
      tradesNeeded: ["Electrician", "Fire Protection", "Controls Technician", "Security Systems"],
      hourlyRate: "$55-85/hr",
    },
    // 10. Reno, NV
    {
      name: "Reno Tahoe Tech Park DC",
      client: "Basin Digital",
      location: "Reno, NV",
      status: "planning",
      description: "New construction leveraging cool desert air for free-cooling 9+ months per year. Adjacent to renewable energy corridor.",
      startDate: "2026-06-01",
      endDate: "2027-12-31",
      progress: 3,
      powerCapacity: "45MW",
      tier: "tier_3",
      latitude: 39.5296,
      longitude: -119.8138,
      tradesNeeded: ["HVAC Technician", "Electrician", "Concrete Specialist", "General Labor"],
      hourlyRate: "$50-80/hr",
    },
    // 11. New Albany, OH (Facebook/Meta hub)
    {
      name: "New Albany Compute Campus",
      client: "Buckeye Cloud Services",
      location: "New Albany, OH",
      status: "active",
      description: "Hyperscale campus with 4 data halls designed for AI/ML training workloads. Direct liquid cooling throughout.",
      startDate: "2025-06-01",
      endDate: "2026-09-15",
      progress: 62,
      powerCapacity: "70MW",
      tier: "tier_4",
      latitude: 40.0812,
      longitude: -82.8085,
      tradesNeeded: ["Electrician", "HVAC Technician", "Pipefitter", "Network Technician", "Plumber"],
      hourlyRate: "$55-90/hr",
    },
    // 12. Richmond, VA
    {
      name: "Richmond Dominion Data Park",
      client: "Commonwealth Digital",
      location: "Richmond, VA",
      status: "completed",
      description: "16MW facility co-located with solar farm providing 40% renewable energy. Enterprise and government tenants.",
      startDate: "2024-08-01",
      endDate: "2025-11-30",
      progress: 100,
      powerCapacity: "16MW",
      tier: "tier_3",
      latitude: 37.5407,
      longitude: -77.4360,
      tradesNeeded: ["Electrician", "HVAC Technician"],
      hourlyRate: "$50-75/hr",
    },
    // 13. Santa Clara, CA
    {
      name: "Santa Clara AI Compute Center",
      client: "Tensor Infrastructure",
      location: "Santa Clara, CA",
      status: "active",
      description: "Purpose-built facility for AI/ML workloads with direct liquid cooling to chip and 100kW+ per rack density support.",
      startDate: "2025-07-01",
      endDate: "2026-11-30",
      progress: 35,
      powerCapacity: "80MW",
      tier: "tier_4",
      latitude: 37.3541,
      longitude: -121.9552,
      tradesNeeded: ["Electrician", "HVAC Technician", "Facility Engineer", "Network Technician", "Controls Technician"],
      hourlyRate: "$65-100/hr",
    },
    // 14. Fort Worth, TX
    {
      name: "Fort Worth Alliance Gateway DC",
      client: "Texas Cloud Ventures",
      location: "Fort Worth, TX",
      status: "active",
      description: "32MW facility near Alliance Airport logistics hub. Supports hybrid cloud deployments with on-ramps to three major CSPs.",
      startDate: "2025-11-01",
      endDate: "2026-12-31",
      progress: 18,
      powerCapacity: "32MW",
      tier: "tier_3",
      latitude: 32.7555,
      longitude: -97.3308,
      tradesNeeded: ["Electrician", "HVAC Technician", "Security Systems", "General Labor", "Welder"],
      hourlyRate: "$50-80/hr",
    },
    // 15. Marietta, GA (Metro Atlanta)
    {
      name: "Marietta Northwest Exchange",
      client: "Peach State Digital",
      location: "Marietta, GA",
      status: "completed",
      description: "Carrier hotel and interconnection hub serving the Southeast US. 350+ network providers with direct cloud on-ramps.",
      startDate: "2024-09-15",
      endDate: "2025-12-01",
      progress: 100,
      powerCapacity: "12MW",
      tier: "tier_3",
      latitude: 33.9526,
      longitude: -84.5499,
      tradesNeeded: ["Network Technician", "Fire Protection"],
      hourlyRate: "$45-70/hr",
    },
  ]).returning();

  // 18 work orders total, 10 completed = 55.6% completion rate
  await db.insert(workOrders).values([
    // --- COMPLETED (10) ---
    {
      title: "Raised Floor Tile Installation - Hall A",
      description: "Install 2,400 perforated floor tiles in Data Hall A. Ensure proper airflow management and cable routing compliance.",
      projectId: createdProjects[2].id, // Phoenix
      assigneeId: createdWorkers[23].id, // Maria Gutierrez
      status: "completed",
      priority: "medium",
      trade: "General",
      dueDate: "2026-01-15",
    },
    {
      title: "BMS Integration for Cooling Plant",
      description: "Configure and test building management system integration with chiller plant and cooling tower controls.",
      projectId: createdProjects[1].id, // Dallas
      assigneeId: createdWorkers[4].id, // Sarah Chen
      status: "completed",
      priority: "high",
      trade: "HVAC",
      dueDate: "2026-01-20",
    },
    {
      title: "Fiber Backbone Termination - Building C",
      description: "Terminate and test 288-strand single-mode fiber backbone between MDF and 6 IDF locations in Building C.",
      projectId: createdProjects[3].id, // Hillsboro (completed project)
      assigneeId: createdWorkers[10].id, // Elena Vasquez
      status: "completed",
      priority: "high",
      trade: "Networking",
      dueDate: "2025-09-15",
    },
    {
      title: "Pre-action Sprinkler System Install",
      description: "Install double-interlock pre-action sprinkler system in Data Hall 1 and 2 with VESDA integration.",
      projectId: createdProjects[5].id, // Atlanta
      assigneeId: createdWorkers[20].id, // Dana Pearson
      status: "completed",
      priority: "high",
      trade: "Fire Protection",
      dueDate: "2026-01-30",
    },
    {
      title: "Structural Steel Erection - Phase 1",
      description: "Erect primary structural steel framing for Data Hall 3 including columns, beams, and roof joists.",
      projectId: createdProjects[6].id, // Las Vegas
      assigneeId: createdWorkers[27].id, // Jasmine Powell
      status: "completed",
      priority: "urgent",
      trade: "Structural",
      dueDate: "2026-01-25",
    },
    {
      title: "Medium-Voltage Switchgear Installation",
      description: "Install and terminate 15kV medium-voltage switchgear lineup for utility service entrance.",
      projectId: createdProjects[4].id, // Columbus
      assigneeId: createdWorkers[1].id, // Darnell Washington
      status: "completed",
      priority: "high",
      trade: "Electrical",
      dueDate: "2026-02-01",
    },
    {
      title: "Access Control System Installation",
      description: "Install Lenel access control panels, card readers, and biometric scanners at all entry points.",
      projectId: createdProjects[8].id, // Manassas
      assigneeId: createdWorkers[25].id, // Nathan Cole
      status: "completed",
      priority: "high",
      trade: "Security",
      dueDate: "2026-01-10",
    },
    {
      title: "Chilled Water Piping - Loop B",
      description: "Install 12-inch chilled water supply and return piping for cooling loop B including isolation valves and strainers.",
      projectId: createdProjects[10].id, // New Albany
      assigneeId: createdWorkers[15].id, // Carlos Mendez
      status: "completed",
      priority: "high",
      trade: "Mechanical",
      dueDate: "2026-02-05",
    },
    {
      title: "Generator Fuel Piping Welding",
      description: "Weld and pressure test diesel fuel supply and return piping for 4x 3MW generator sets.",
      projectId: createdProjects[1].id, // Dallas
      assigneeId: createdWorkers[17].id, // Jake Hernandez
      status: "completed",
      priority: "medium",
      trade: "Welding",
      dueDate: "2025-12-20",
    },
    {
      title: "Structured Cabling - Meet-Me Room",
      description: "Complete Cat6A and fiber cabling installation in carrier meet-me room including patch panels and cable management.",
      projectId: createdProjects[14].id, // Marietta (completed project)
      assigneeId: createdWorkers[12].id, // Kendra Lawson
      status: "completed",
      priority: "medium",
      trade: "Networking",
      dueDate: "2025-11-15",
    },
    // --- IN PROGRESS (4) ---
    {
      title: "Install PDU Bus Duct in Hall A",
      description: "Install and commission 4x 500A bus duct runs from main switchgear to PDU positions A1-A4.",
      projectId: createdProjects[2].id, // Phoenix
      assigneeId: createdWorkers[0].id, // Marcus Rivera
      status: "in_progress",
      priority: "high",
      trade: "Electrical",
      dueDate: "2026-03-15",
    },
    {
      title: "Commission CRAH Units 5-8",
      description: "Complete startup and commissioning of CRAH units 5-8 in Data Hall 2. Verify airflow, cooling capacity, and BMS integration.",
      projectId: createdProjects[1].id, // Dallas
      assigneeId: createdWorkers[4].id, // Sarah Chen
      status: "in_progress",
      priority: "medium",
      trade: "HVAC",
      dueDate: "2026-03-10",
    },
    {
      title: "Concrete Pad Pour - Generator Yard",
      description: "Form and pour reinforced concrete equipment pads for 6x generator sets with embedded anchor bolts and conduit stubs.",
      projectId: createdProjects[6].id, // Las Vegas
      assigneeId: createdWorkers[26].id, // Raymond Voss
      status: "in_progress",
      priority: "urgent",
      trade: "Concrete",
      dueDate: "2026-03-20",
    },
    {
      title: "BMS Programming - Critical Systems",
      description: "Program and commission BMS points for UPS, PDU, CRAH, and generator monitoring. Configure alarm setpoints and escalation paths.",
      projectId: createdProjects[12].id, // Santa Clara
      assigneeId: createdWorkers[21].id, // Victor Pham
      status: "in_progress",
      priority: "high",
      trade: "Controls",
      dueDate: "2026-03-25",
    },
    // --- OPEN (4) ---
    {
      title: "Fiber Optic Backbone Installation",
      description: "Run single-mode fiber backbone between MDF and all IDF locations. 288-strand count with 30% spare capacity.",
      projectId: createdProjects[4].id, // Columbus
      assigneeId: createdWorkers[11].id, // Tyrone Brooks
      status: "open",
      priority: "high",
      trade: "Networking",
      dueDate: "2026-04-01",
    },
    {
      title: "Generator Load Bank Testing",
      description: "Perform 4-hour load bank test on all 6 diesel generators at 100% rated capacity. Document fuel consumption and voltage stability.",
      projectId: createdProjects[12].id, // Santa Clara
      assigneeId: createdWorkers[13].id, // Robert Kim
      status: "open",
      priority: "urgent",
      trade: "Electrical",
      dueDate: "2026-03-30",
    },
    {
      title: "UPS Battery Replacement - Module 3",
      description: "Replace end-of-life battery strings in UPS Module 3. Coordinate with operations for planned maintenance window.",
      projectId: createdProjects[0].id, // Ashburn
      assigneeId: createdWorkers[3].id, // Angela Patterson
      status: "open",
      priority: "high",
      trade: "Electrical",
      dueDate: "2026-04-10",
    },
    {
      title: "Fire Suppression System Inspection",
      description: "Annual inspection of clean agent fire suppression system in all server halls. Verify agent levels, detection systems, and release mechanisms.",
      projectId: createdProjects[5].id, // Atlanta
      assigneeId: createdWorkers[19].id, // Keith Morrison
      status: "open",
      priority: "medium",
      trade: "Fire Protection",
      dueDate: "2026-04-15",
    },
  ]);

  await db.insert(projectAssignments).values([
    // Ashburn Data Hall Expansion
    { workerId: createdWorkers[8].id, projectId: createdProjects[0].id, role: "foreman" },  // James Okafor
    { workerId: createdWorkers[3].id, projectId: createdProjects[0].id, role: "crew" },     // Angela Patterson
    { workerId: createdWorkers[14].id, projectId: createdProjects[0].id, role: "crew" },    // Patricia Hayes
    { workerId: createdWorkers[19].id, projectId: createdProjects[0].id, role: "crew" },    // Keith Morrison
    // Dallas Metro Edge Campus
    { workerId: createdWorkers[4].id, projectId: createdProjects[1].id, role: "lead" },     // Sarah Chen
    { workerId: createdWorkers[17].id, projectId: createdProjects[1].id, role: "crew" },    // Jake Hernandez
    { workerId: createdWorkers[12].id, projectId: createdProjects[1].id, role: "crew" },    // Kendra Lawson
    // Phoenix Hyperscale DC-3
    { workerId: createdWorkers[0].id, projectId: createdProjects[2].id, role: "lead" },     // Marcus Rivera
    { workerId: createdWorkers[8].id, projectId: createdProjects[2].id, role: "foreman" },  // James Okafor
    { workerId: createdWorkers[15].id, projectId: createdProjects[2].id, role: "crew" },    // Carlos Mendez
    { workerId: createdWorkers[23].id, projectId: createdProjects[2].id, role: "crew" },    // Maria Gutierrez
    // Hillsboro Network Hub (completed)
    { workerId: createdWorkers[10].id, projectId: createdProjects[3].id, role: "lead" },    // Elena Vasquez
    { workerId: createdWorkers[9].id, projectId: createdProjects[3].id, role: "foreman" },  // Linda Nguyen
    // Columbus Cloud Core Facility
    { workerId: createdWorkers[1].id, projectId: createdProjects[4].id, role: "lead" },     // Darnell Washington
    { workerId: createdWorkers[11].id, projectId: createdProjects[4].id, role: "crew" },    // Tyrone Brooks
    { workerId: createdWorkers[22].id, projectId: createdProjects[4].id, role: "crew" },    // DeShawn Carter
    // Atlanta Peachtree Data Campus
    { workerId: createdWorkers[6].id, projectId: createdProjects[5].id, role: "lead" },     // Brittany Daniels
    { workerId: createdWorkers[20].id, projectId: createdProjects[5].id, role: "crew" },    // Dana Pearson
    { workerId: createdWorkers[24].id, projectId: createdProjects[5].id, role: "crew" },    // Brian Foster
    // Las Vegas Switch Citadel Phase II
    { workerId: createdWorkers[2].id, projectId: createdProjects[6].id, role: "lead" },     // Travis McCoy
    { workerId: createdWorkers[18].id, projectId: createdProjects[6].id, role: "crew" },    // Samantha Reed
    { workerId: createdWorkers[26].id, projectId: createdProjects[6].id, role: "crew" },    // Raymond Voss
    { workerId: createdWorkers[27].id, projectId: createdProjects[6].id, role: "crew" },    // Jasmine Powell
    // Manassas Enterprise Vault
    { workerId: createdWorkers[25].id, projectId: createdProjects[8].id, role: "crew" },    // Nathan Cole
    { workerId: createdWorkers[19].id, projectId: createdProjects[8].id, role: "crew" },    // Keith Morrison
    // New Albany Compute Campus
    { workerId: createdWorkers[15].id, projectId: createdProjects[10].id, role: "crew" },   // Carlos Mendez
    { workerId: createdWorkers[16].id, projectId: createdProjects[10].id, role: "crew" },   // Tommy Sullivan
    // Santa Clara AI Compute Center
    { workerId: createdWorkers[13].id, projectId: createdProjects[12].id, role: "lead" },   // Robert Kim
    { workerId: createdWorkers[21].id, projectId: createdProjects[12].id, role: "crew" },   // Victor Pham
    // Fort Worth Alliance Gateway DC
    { workerId: createdWorkers[25].id, projectId: createdProjects[13].id, role: "crew" },   // Nathan Cole
    { workerId: createdWorkers[5].id, projectId: createdProjects[13].id, role: "crew" },    // Miguel Torres
    // Marietta Northwest Exchange (completed)
    { workerId: createdWorkers[12].id, projectId: createdProjects[14].id, role: "lead" },   // Kendra Lawson
  ]);

  await db.insert(chatMessages).values([
    // Phoenix Hyperscale DC-3
    { projectId: createdProjects[2].id, senderId: createdWorkers[8].id, content: "Team meeting at 7AM tomorrow at the main switchgear room. Bring your PPE." },
    { projectId: createdProjects[2].id, senderId: createdWorkers[0].id, content: "Copy that. I'll have the bus duct specs printed out for everyone." },
    { projectId: createdProjects[2].id, senderId: createdWorkers[15].id, content: "Chilled water piping for Hall B is staged and ready. Need a crane slot for the headers tomorrow." },
    { projectId: createdProjects[2].id, senderId: createdWorkers[8].id, content: "Good. I'll get you the 10AM crane window. Maria, how's the raised floor coming along?" },
    { projectId: createdProjects[2].id, senderId: createdWorkers[23].id, content: "Hall A is done. Starting Hall B prep work this afternoon." },
    // Dallas Metro Edge Campus
    { projectId: createdProjects[1].id, senderId: createdWorkers[4].id, content: "CRAH units 1-4 are commissioned and running. Moving to units 5-8 this week." },
    { projectId: createdProjects[1].id, senderId: createdWorkers[17].id, content: "Fuel piping passed pressure test. Ready for generator startup when you give the green light." },
    // Columbus Cloud Core Facility
    { projectId: createdProjects[4].id, senderId: createdWorkers[1].id, content: "Switchgear is energized and holding. Starting PDU terminations in the morning." },
    { projectId: createdProjects[4].id, senderId: createdWorkers[11].id, content: "I'll start pulling fiber to IDF-3 and IDF-4 tomorrow. Can someone help with cable tray access?" },
    { projectId: createdProjects[4].id, senderId: createdWorkers[22].id, content: "I can help with the tray work. I'll bring the lift over first thing." },
    // Las Vegas Switch Citadel Phase II
    { projectId: createdProjects[6].id, senderId: createdWorkers[2].id, content: "Concrete pads for generators 1-3 are curing. Raymond, when can we pour 4-6?" },
    { projectId: createdProjects[6].id, senderId: createdWorkers[26].id, content: "Rebar is tied for pad 4. We can pour Thursday if the weather holds." },
    { projectId: createdProjects[6].id, senderId: createdWorkers[27].id, content: "Steel for Hall 3 roof deck arrives Monday. I'll need two days to get it set." },
  ]);

  console.log("Database seeded successfully with realistic data center data.");
}
