import { MementoUIMessage } from "./components/types";

export const conversation: MementoUIMessage[] = [
  {
    id: "msg_user_001",
    role: "user",
    parts: [
      {
        type: "text",
        text: "I've been working on my quantum computing thesis and I'm trying to remember what I wrote about quantum error correction methods. Could you help me reconstruct my notes on surface codes and topological qubits? Also, I think I had some thoughts about how this relates to Microsoft's approach with Majorana particles.",
      },
    ],
  },

  {
    id: "msg_assistant_001",
    role: "assistant",
    parts: [
      {
        type: "data-thinking",
        data: {
          title: "Initial query parsing and scope definition",
          status: "running",
          message: "Analyzing user request for quantum error correction, surface codes, topological qubits, and Majorana connections. Scanning 847 indexed notes across 12 source applications."
        }
      },
      {
        type: "data-thinking",
        data: {
          title: "Source filtering and prioritization",
          status: "running",
          message: "Identified 43 relevant notes. Prioritizing: Nature papers (2025), Microsoft Research publications, lecture notes from MIT 8.371 (Fall 2025), and personal Obsidian vault entries tagged #quantum-error-correction."
        }
      },
      {
        type: "data-thinking",
        data: {
          title: "Deep semantic analysis - Surface codes",
          status: "running",
          message: "Extracting key concepts from 18 notes on surface codes. Found hierarchical structure: basic lattice configuration, stabilizer measurements, syndrome extraction, decoding algorithms, threshold theorems, experimental implementations. Cross-referencing with Google Sycamore results from March 2025."
        }
      },
      {
        type: "data-thinking",
        data: {
          title: "Deep semantic analysis - Topological qubits",
          status: "running",
          message: "Processing 15 notes on topological quantum computation. Categories: anyon theory (non-Abelian statistics), braiding operations, Fibonacci anyons, Ising anyons. Your notes include detailed margin annotations on Kitaev's toric code model with personal insights about experimental feasibility."
        }
      },
      {
        type: "data-thinking",
        data: {
          title: "Deep semantic analysis - Majorana physics",
          status: "running", 
          message: "Analyzing 10 notes on Majorana zero modes. Topics covered: semiconductor-superconductor nanowires, topological protection mechanisms, Majorana braiding protocols. Your notes from Microsoft's Station Q workshop (Dec 2025) contain extensive commentary on recent InAs-Al devices."
        }
      },
      {
        type: "data-thinking",
        data: {
          title: "Synthesis and connection mapping",
          status: "running",
          message: "Building relationship graph between surface codes, topological protection, and Majorana-based architectures. Found explicit connections in your notes about how surface codes can be understood through topological order, and how Majorana modes realize non-Abelian statistics required for topological qubits."
        }
      },
      {
        type: "data-thinking",
        data: {
          title: "Temporal organization",
          status: "running",
          message: "Chronologically organizing findings: Basic theory (Sep 2024), Advanced concepts (Mar 2025), Current research (Jan 2026). Noting evolution of your understanding through margin comments and cross-references added over time."
        }
      },
      {
        type: "text",
        text: "Based on your notes from multiple sources, I can reconstruct your comprehensive understanding of quantum error correction and topological qubits. Your notes start with the fundamental principle that quantum error correction is essential because qubits are extremely fragile - they decohere in microseconds and are affected by both bit-flip and phase-flip errors simultaneously, unlike classical bits which only suffer bit-flips. [[source:source_001]] [[source:source_008]] [[source:source_012]]"
      },
      {
        type: "data-citation",
        data: {
          sourceId: "source_001",
          appName: "Obsidian",
          windowName: "QEC Fundamentals",
          capturedAt: "2024-09-15T10:30:00Z",
          url: "vault://quantum/qec-fundamentals",
          bbox: { x: 50, y: 120, width: 800, height: 400, textStart: 10, textEnds: 380 },
          imagePath: "/screenshots/obsidian_qec_fundamentals.png"
        }
      },
      {
        type: "data-citation",
        data: {
          sourceId: "source_008",
          appName: "arXiv PDF",
          windowName: "Quantum Error Correction: An Introduction",
          capturedAt: "2024-10-22T14:15:00Z",
          url: "arxiv.org/pdf/2405.12345",
          bbox: { x: 75, y: 200, width: 650, height: 300, textStart: 45, textEnds: 280 },
          imagePath: "/screenshots/arxiv_qec_intro.png"
        }
      },
      {
        type: "data-citation",
        data: {
          sourceId: "source_012",
          appName: "Notion",
          windowName: "QEC Course Notes",
          capturedAt: "2024-11-05T16:20:00Z",
          url: "notion.so/qec-course-notes",
          bbox: { x: 30, y: 150, width: 720, height: 350, textStart: 5, textEnds: 320 },
          imagePath: "/screenshots/notion_qec_course.png"
        }
      },
      {
        type: "text",
        text: "For surface codes specifically, your notes contain a detailed explanation that they work by arranging physical qubits on a 2D lattice. The key insight, which you highlighted in your margin notes, is that surface codes measure stabilizer operators on plaquettes and vertices without disturbing the encoded logical information. You derived that the error syndrome (where stabilizers return -1 instead of +1) reveals both the type and location of errors, and this information feeds into decoding algorithms that determine the most likely error chain. [[source:source_002]] [[source:source_015]] [[source:source_023]] [[source:source_031]]"
      },
      {
        type: "data-citation",
        data: {
          sourceId: "source_002",
          appName: "Chrome",
          windowName: "Surface Code Lattice Simulator",
          capturedAt: "2025-01-18T09:45:00Z",
          url: "quantum-computing-explorer.cloud/surface-codes",
          bbox: { x: 200, y: 300, width: 1024, height: 600, textStart: 150, textEnds: 550 },
          imagePath: "/screenshots/surface_code_simulator.png"
        }
      },
      {
        type: "data-citation",
        data: {
          sourceId: "source_015",
          appName: "PDF Reader",
          windowName: "Surface Codes: A Practical Introduction",
          capturedAt: "2025-02-03T11:30:00Z",
          url: "journals.aps.org/pra/surface-codes",
          bbox: { x: 80, y: 180, width: 600, height: 500, textStart: 60, textEnds: 450 },
          imagePath: "/screenshots/surface_codes_paper.png"
        }
      },
      {
        type: "data-citation",
        data: {
          sourceId: "source_023",
          appName: "Obsidian",
          windowName: "Surface Code Decoding Algorithms",
          capturedAt: "2025-02-28T15:10:00Z",
          url: "vault://quantum/surface-code-decoders",
          bbox: { x: 40, y: 100, width: 750, height: 380, textStart: 20, textEnds: 350 },
          imagePath: "/screenshots/surface_code_decoders.png"
        }
      },
      {
        type: "data-citation",
        data: {
          sourceId: "source_031",
          appName: "Microsoft OneNote",
          windowName: "QEC Working Group Notes",
          capturedAt: "2025-03-12T20:15:00Z",
          url: "onenote://qec-group/surface-codes",
          bbox: { x: 100, y: 250, width: 850, height: 400, textStart: 80, textEnds: 370 },
          imagePath: "/screenshots/qec_working_group.png"
        }
      },
      {
        type: "text",
        text: "Your notes on topological qubits show a deep progression in understanding. Initially, you wrote that topological qubits encode information non-locally in the global properties of the system, making them inherently protected against local perturbations. You later annotated this with: 'This is the key - local errors can't destroy topologically protected information because there's no local observable that measures it.' The braiding of anyons implements quantum gates through their exchange statistics, and you worked through examples showing how Fibonacci anyons could theoretically achieve universal quantum computation through braiding alone. [[source:source_003]] [[source:source_016]] [[source:source_025]] [[source:source_034]]"
      },
      {
        type: "data-citation",
        data: {
          sourceId: "source_003",
          appName: "Notion",
          windowName: "Topological Quantum Computation Notes",
          capturedAt: "2025-04-07T13:25:00Z",
          url: "notion.so/topological-quantum-computation",
          bbox: { x: 55, y: 160, width: 680, height: 420, textStart: 25, textEnds: 390 },
          imagePath: "/screenshots/topological_computation.png"
        }
      },
      {
        type: "data-citation",
        data: {
          sourceId: "source_016",
          appName: "Chrome",
          windowName: "Anyons and Non-Abelian Statistics",
          capturedAt: "2025-04-22T10:50:00Z",
          url: "youtube.com/watch?v=anyon-lecture",
          bbox: { x: 320, y: 400, width: 1280, height: 720, textStart: 300, textEnds: 680 },
          imagePath: "/screenshots/anyons_lecture.png"
        }
      },
      {
        type: "data-citation",
        data: {
          sourceId: "source_025",
          appName: "PDF Reader",
          windowName: "Fibonacci Anyons for Universal Computation",
          capturedAt: "2025-05-15T16:40:00Z",
          url: "nature.com/articles/s41586-025-12345",
          bbox: { x: 70, y: 220, width: 620, height: 480, textStart: 45, textEnds: 430 },
          imagePath: "/screenshots/fibonacci_anyons.png"
        }
      },
      {
        type: "data-citation",
        data: {
          sourceId: "source_034",
          appName: "Obsidian",
          windowName: "Anyon Braiding Calculations",
          capturedAt: "2025-06-01T09:30:00Z",
          url: "vault://quantum/anyon-braiding",
          bbox: { x: 35, y: 130, width: 780, height: 360, textStart: 15, textEnds: 330 },
          imagePath: "/screenshots/anyon_braiding.png"
        }
      },
      {
        type: "text",
        text: "Regarding Microsoft's approach with Majorana particles, your notes are particularly detailed. You attended the Station Q workshop in December 2025 and documented that Majorana zero modes emerge as quasiparticles at the ends of topological superconductors. These modes obey non-Abelian statistics, meaning that braiding them changes the quantum state in a way that depends only on the topology of the braid, not the specific path. Your handwritten notes from the workshop include a diagram showing how four Majorana modes can encode a single qubit, with the state determined by the fermion parity of pairs. [[source:source_004]] [[source:source_017]] [[source:source_026]] [[source:source_035]] [[source:source_041]]"
      },
      {
        type: "data-citation",
        data: {
          sourceId: "source_004",
          appName: "Microsoft OneNote",
          windowName: "Station Q Workshop Day 1",
          capturedAt: "2025-12-03T17:30:00Z",
          url: "onenote://station-q/day1",
          bbox: { x: 90, y: 280, width: 900, height: 500, textStart: 70, textEnds: 460 },
          imagePath: "/screenshots/station_q_day1.png"
        }
      },
      {
        type: "data-citation",
        data: {
          sourceId: "source_017",
          appName: "Microsoft OneNote",
          windowName: "Station Q Workshop Day 2",
          capturedAt: "2025-12-04T18:15:00Z",
          url: "onenote://station-q/day2",
          bbox: { x: 85, y: 270, width: 890, height: 510, textStart: 65, textEnds: 470 },
          imagePath: "/screenshots/station_q_day2.png"
        }
      },
      {
        type: "data-citation",
        data: {
          sourceId: "source_026",
          appName: "PDF Reader",
          windowName: "Majorana Zero Modes in Nanowires",
          capturedAt: "2025-10-11T14:20:00Z",
          url: "science.org/doi/10.1126/science.majorana",
          bbox: { x: 60, y: 190, width: 640, height: 450, textStart: 40, textEnds: 410 },
          imagePath: "/screenshots/majorana_nanowires.png"
        }
      },
      {
        type: "data-citation",
        data: {
          sourceId: "source_035",
          appName: "Obsidian",
          windowName: "Majorana Braiding Protocols",
          capturedAt: "2025-11-20T11:45:00Z",
          url: "vault://quantum/majorana-braiding",
          bbox: { x: 45, y: 140, width: 760, height: 390, textStart: 25, textEnds: 360 },
          imagePath: "/screenshots/majorana_braiding.png"
        }
      },
      {
        type: "data-citation",
        data: {
          sourceId: "source_041",
          appName: "Chrome",
          windowName: "Microsoft Azure Quantum Blog",
          capturedAt: "2026-01-15T15:30:00Z",
          url: "azure.microsoft.com/blog/topological-qubit-breakthrough",
          bbox: { x: 250, y: 350, width: 1100, height: 650, textStart: 220, textEnds: 590 },
          imagePath: "/screenshots/azure_quantum_blog.png"
        }
      },
      {
        type: "text",
        text: "You made an important connection between surface codes and topological qubits in your synthesis notes. You wrote that the toric code, which is the foundation of surface codes, is actually an example of a system with topological order, and its excitations (anyons) follow specific fusion and braiding rules. This insight led you to understand that surface codes are essentially a practical implementation of topological quantum memory, and that the error correction decoding problem maps onto identifying which anyons have been created and how they should be annihilated. [[source:source_005]] [[source:source_018]] [[source:source_027]] [[source:source_036]]"
      },
      {
        type: "data-citation",
        data: {
          sourceId: "source_005",
          appName: "Obsidian",
          windowName: "Toric Code and Surface Codes Connection",
          capturedAt: "2025-07-08T12:10:00Z",
          url: "vault://quantum/toric-surface-connection",
          bbox: { x: 55, y: 170, width: 820, height: 430, textStart: 30, textEnds: 400 },
          imagePath: "/screenshots/toric_surface_connection.png"
        }
      },
      {
        type: "data-citation",
        data: {
          sourceId: "source_018",
          appName: "PDF Reader",
          windowName: "Toric Code as a Topological Phase",
          capturedAt: "2025-07-22T09:50:00Z",
          url: "arxiv.org/pdf/2507.08923",
          bbox: { x: 65, y: 210, width: 630, height: 470, textStart: 45, textEnds: 420 },
          imagePath: "/screenshots/toric_code_paper.png"
        }
      },
      {
        type: "data-citation",
        data: {
          sourceId: "source_027",
          appName: "Notion",
          windowName: "Anyon Fusion Rules",
          capturedAt: "2025-08-05T16:30:00Z",
          url: "notion.so/anyon-fusion",
          bbox: { x: 40, y: 150, width: 700, height: 380, textStart: 20, textEnds: 350 },
          imagePath: "/screenshots/anyon_fusion.png"
        }
      },
      {
        type: "data-citation",
        data: {
          sourceId: "source_036",
          appName: "Chrome",
          windowName: "Topological Quantum Error Correction",
          capturedAt: "2025-08-18T14:45:00Z",
          url: "quantumfrontiers.com/topological-qec",
          bbox: { x: 180, y: 280, width: 950, height: 550, textStart: 150, textEnds: 520 },
          imagePath: "/screenshots/topological_qec.png"
        }
      },
      {
        type: "text",
        text: "Your notes on experimental progress show that you tracked developments carefully. You noted that in 2025, Microsoft reported evidence of Majorana zero modes in InAs-Al nanowire devices with improved stability and longer coherence times. However, your skeptical annotation reads: 'Need to see braiding experiments - zero modes alone don't prove non-Abelian statistics.' You also documented Google's surface code experiment achieving logical qubit error suppression below the threshold for the first time, with distance-3 and distance-5 surface codes showing the expected exponential suppression of errors. [[source:source_006]] [[source:source_019]] [[source:source_028]] [[source:source_037]] [[source:source_042]]"
      },
      {
        type: "data-citation",
        data: {
          sourceId: "source_006",
          appName: "Chrome",
          windowName: "Microsoft Majorana Breakthrough Paper",
          capturedAt: "2025-09-10T13:20:00Z",
          url: "nature.com/articles/s41586-025-09123-4",
          bbox: { x: 210, y: 320, width: 1050, height: 620, textStart: 180, textEnds: 570 },
          imagePath: "/screenshots/microsoft_majorana_paper.png"
        }
      },
      {
        type: "data-citation",
        data: {
          sourceId: "source_019",
          appName: "PDF Reader",
          windowName: "Google Sycamore Surface Code Results",
          capturedAt: "2025-09-25T10:15:00Z",
          url: "nature.com/articles/s41586-025-09234-y",
          bbox: { x: 75, y: 200, width: 650, height: 480, textStart: 55, textEnds: 440 },
          imagePath: "/screenshots/google_sycamore.png"
        }
      },
      {
        type: "data-citation",
        data: {
          sourceId: "source_028",
          appName: "Obsidian",
          windowName: "Experimental Progress Tracker",
          capturedAt: "2025-10-03T09:45:00Z",
          url: "vault://quantum/experimental-tracker",
          bbox: { x: 50, y: 160, width: 780, height: 420, textStart: 30, textEnds: 390 },
          imagePath: "/screenshots/experimental_tracker.png"
        }
      },
      {
        type: "data-citation",
        data: {
          sourceId: "source_037",
          appName: "Notion",
          windowName: "Quantum Hardware Database",
          capturedAt: "2025-10-15T17:30:00Z",
          url: "notion.so/quantum-hardware",
          bbox: { x: 45, y: 180, width: 710, height: 450, textStart: 25, textEnds: 410 },
          imagePath: "/screenshots/quantum_hardware.png"
        }
      },
      {
        type: "data-citation",
        data: {
          sourceId: "source_042",
          appName: "Chrome",
          windowName: "APS March Meeting 2025 Talks",
          capturedAt: "2025-11-08T20:00:00Z",
          url: "aps.org/meetings/march-2025/quantum",
          bbox: { x: 190, y: 290, width: 980, height: 580, textStart: 160, textEnds: 530 },
          imagePath: "/screenshots/aps_march_2025.png"
        }
      },
      {
        type: "text",
        text: "Your future research directions section outlines several open problems you identified. You wrote that the main challenges are: scaling surface codes to distances greater than 7 while maintaining low latency decoding, demonstrating non-Abelian braiding in Majorana systems, and developing hybrid approaches that combine topological protection with active error correction. Your final synthesis note concludes: 'The future likely belongs to architectures that use topological protection at the hardware level to reduce the overhead of active error correction - surface codes provide the QEC framework, topological qubits provide the protected building blocks.' [[source:source_007]] [[source:source_020]] [[source:source_029]] [[source:source_038]] [[source:source_043]]"
      },
      {
        type: "data-citation",
        data: {
          sourceId: "source_007",
          appName: "Obsidian",
          windowName: "Future Research Directions",
          capturedAt: "2026-01-20T14:30:00Z",
          url: "vault://quantum/future-directions",
          bbox: { x: 55, y: 170, width: 820, height: 450, textStart: 35, textEnds: 420 },
          imagePath: "/screenshots/future_directions.png"
        }
      },
      {
        type: "data-citation",
        data: {
          sourceId: "source_020",
          appName: "Notion",
          windowName: "Open Problems in QEC",
          capturedAt: "2026-01-25T11:20:00Z",
          url: "notion.so/qec-open-problems",
          bbox: { x: 40, y: 150, width: 700, height: 380, textStart: 20, textEnds: 350 },
          imagePath: "/screenshots/qec_open_problems.png"
        }
      },
      {
        type: "data-citation",
        data: {
          sourceId: "source_029",
          appName: "PDF Reader",
          windowName: "Roadmap for Fault-Tolerant Quantum Computing",
          capturedAt: "2026-01-28T16:45:00Z",
          url: "iop.org/quantum-roadmap-2026",
          bbox: { x: 70, y: 220, width: 640, height: 490, textStart: 50, textEnds: 450 },
          imagePath: "/screenshots/quantum_roadmap.png"
        }
      },
      {
        type: "data-citation",
        data: {
          sourceId: "source_038",
          appName: "Microsoft OneNote",
          windowName: "Research Planning 2026",
          capturedAt: "2026-02-01T10:00:00Z",
          url: "onenote://research/planning-2026",
          bbox: { x: 95, y: 260, width: 880, height: 520, textStart: 75, textEnds: 480 },
          imagePath: "/screenshots/research_planning.png"
        }
      },
      {
        type: "data-citation",
        data: {
          sourceId: "source_043",
          appName: "Chrome",
          windowName: "DARPA Quantum Benchmarking Program",
          capturedAt: "2026-02-05T13:15:00Z",
          url: "darpa.mil/programs/quantum-benchmarking",
          bbox: { x: 220, y: 330, width: 1020, height: 590, textStart: 190, textEnds: 550 },
          imagePath: "/screenshots/darpa_quantum.png"
        }
      },
      {
        type: "data-thinking",
        data: {
          title: "Response synthesis complete",
          status: "running",
          message: "Successfully integrated 43 source notes into coherent narrative covering surface codes, topological qubits, Majorana physics, and future directions. Citations span 12 source applications with timestamps from Sep 2024 to Feb 2026."
        }
      }
    ]
  }
];