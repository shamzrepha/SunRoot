// ---------------------------------------------------------------------------
// ComponentArt
//
// Hand-drawn SVG portraits of each part, matched to how the real hardware
// looks: an ESP32 has a dark green board, a steel RF can and a gold meander
// antenna; a relay module is blue with a cube relay and green screw terminals;
// a capacitive soil probe is a green fork with a tapered tip.
//
// This matters more than decoration. A student who has met these images should
// recognise the physical part on a bench, and generic boxes would teach them
// nothing transferable. Everything is vector, so nothing is downloaded, nothing
// depends on a CDN, and the art stays sharp at any size.
//
// Shared drawing conventions: a 120×90 viewBox, light from the upper left,
// gold pads (#c9a227), black headers (#15181c), white silkscreen (#eef2ee).
// ---------------------------------------------------------------------------

import type { Category } from '../hardware/ComponentCatalog'

const VB = 'viewBox="0 0 120 90" xmlns="http://www.w3.org/2000/svg"'

/** Gold-plated header pins along an edge. */
function header(x: number, y: number, count: number, gap = 6, vertical = false): string {
  let out = ''
  for (let i = 0; i < count; i++) {
    const px = vertical ? x : x + i * gap
    const py = vertical ? y + i * gap : y
    out += `<rect x="${px}" y="${py}" width="3.4" height="3.4" rx="0.6" fill="#c9a227"/>`
  }
  return out
}

/** Black plastic header strip behind the pins. */
function headerStrip(x: number, y: number, w: number, h: number): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1" fill="#15181c"/>`
}

const ART: Record<string, string> = {
  // ------------------------------------------------------------- ESP32 boards
  esp32: `<svg ${VB}>
    <defs><linearGradient id="pcbG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1d4a35"/><stop offset="1" stop-color="#14351f"/></linearGradient>
      <linearGradient id="shield" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#d8dde3"/><stop offset="0.5" stop-color="#9aa2ab"/>
        <stop offset="1" stop-color="#c2c9d1"/></linearGradient></defs>
    <rect x="26" y="8" width="68" height="74" rx="3" fill="url(#pcbG)" stroke="#0d2416"/>
    ${headerStrip(26, 10, 6, 70)}${headerStrip(88, 10, 6, 70)}
    ${header(27.3, 13, 11, 6.2, true)}${header(89.3, 13, 11, 6.2, true)}
    <!-- gold meander PCB antenna at the top edge -->
    <path d="M46 12h4v4h4v-4h4v4h4v-4h4v7H46z" fill="#c9a227" opacity="0.95"/>
    <!-- steel RF shield over the SoC -->
    <rect x="44" y="22" width="32" height="26" rx="2" fill="url(#shield)" stroke="#7a838d"/>
    <rect x="47" y="25" width="26" height="20" rx="1" fill="none" stroke="#aab2ba" opacity="0.6"/>
    <text x="60" y="38" font-family="monospace" font-size="5" fill="#5d666f" text-anchor="middle">ESP32</text>
    <!-- micro USB at the bottom -->
    <rect x="50" y="74" width="20" height="9" rx="1.6" fill="#b9c0c8" stroke="#868e96"/>
    <rect x="53" y="76.5" width="14" height="4" rx="1" fill="#3a4048"/>
    <!-- buttons, regulator, LEDs -->
    <rect x="33" y="66" width="9" height="6" rx="1" fill="#2b3138"/>
    <rect x="78" y="66" width="9" height="6" rx="1" fill="#2b3138"/>
    <rect x="47" y="53" width="8" height="5" rx="0.8" fill="#1a1d21"/>
    <circle cx="70" cy="55" r="1.8" fill="#e04b3c"/><circle cx="76" cy="55" r="1.8" fill="#3fa5e8"/>
  </svg>`,

  // --------------------------------------------------------------- Arduino Uno
  unoR3: `<svg ${VB}>
    <defs><linearGradient id="unoPcb" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#12808c"/><stop offset="1" stop-color="#0c626c"/></linearGradient></defs>
    <path d="M10 14h96a3 3 0 0 1 3 3v52a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3V17a3 3 0 0 1 3-3Z"
          fill="url(#unoPcb)" stroke="#08464e"/>
    <!-- USB-B and barrel jack along the left edge -->
    <rect x="4" y="20" width="18" height="16" rx="1.5" fill="#c5ccd3" stroke="#8e969e"/>
    <rect x="7" y="23" width="12" height="10" rx="0.8" fill="#4b525a"/>
    <rect x="4" y="50" width="16" height="13" rx="2" fill="#191c20" stroke="#0d0f12"/>
    <circle cx="12" cy="56.5" r="2.6" fill="#3a4048"/>
    <!-- headers -->
    ${headerStrip(30, 14, 56, 6)}${header(31.5, 15.3, 9, 6)}
    ${headerStrip(30, 66, 40, 6)}${header(31.5, 67.3, 6, 6)}
    ${headerStrip(76, 66, 28, 6)}${header(77.5, 67.3, 4, 6)}
    <!-- ATmega328P in its socket -->
    <rect x="42" y="38" width="42" height="16" rx="1" fill="#1b1e22" stroke="#0e1013"/>
    <circle cx="46" cy="46" r="1.6" fill="#3b4148"/>
    <text x="65" y="48.5" font-family="monospace" font-size="4.6" fill="#7e858c" text-anchor="middle">ATMEGA328P</text>
    <!-- crystal, reset button, LEDs -->
    <rect x="90" y="40" width="11" height="6" rx="2.6" fill="#b6bdc4" stroke="#8b9299"/>
    <rect x="30" y="24" width="8" height="8" rx="1" fill="#c0392b"/>
    <circle cx="94" cy="26" r="1.9" fill="#4fd67a"/><circle cx="100" cy="26" r="1.9" fill="#e0a83c"/>
  </svg>`,

  // ------------------------------------------------------------- solderless BB
  breadboardFull: `<svg ${VB}>
    <rect x="6" y="10" width="108" height="70" rx="3" fill="#f2efe6" stroke="#cbc6b6"/>
    <line x1="6" y1="19" x2="114" y2="19" stroke="#d24b3f" stroke-width="1.2"/>
    <line x1="6" y1="24" x2="114" y2="24" stroke="#3a6fd0" stroke-width="1.2"/>
    <line x1="6" y1="66" x2="114" y2="66" stroke="#d24b3f" stroke-width="1.2"/>
    <line x1="6" y1="71" x2="114" y2="71" stroke="#3a6fd0" stroke-width="1.2"/>
    <rect x="6" y="43" width="108" height="5" fill="#e3dfd2"/>
    <g fill="#b8b2a2">
      ${Array.from({ length: 20 }, (_, c) =>
        Array.from({ length: 5 }, (_, r) =>
          `<rect x="${11 + c * 5.2}" y="${29 + r * 2.8}" width="1.7" height="1.7"/>`,
        ).join(''),
      ).join('')}
      ${Array.from({ length: 20 }, (_, c) =>
        Array.from({ length: 5 }, (_, r) =>
          `<rect x="${11 + c * 5.2}" y="${50 + r * 2.8}" width="1.7" height="1.7"/>`,
        ).join(''),
      ).join('')}
    </g>
  </svg>`,

  veroboard: `<svg ${VB}>
    <rect x="8" y="12" width="104" height="66" rx="2" fill="#c99a5e" stroke="#a87c45"/>
    <g fill="none" stroke="#b8763c" stroke-width="3" opacity="0.85">
      ${Array.from({ length: 9 }, (_, r) => `<line x1="12" y1="${19 + r * 7}" x2="108" y2="${19 + r * 7}"/>`).join('')}
    </g>
    <g fill="#8a5a2b">
      ${Array.from({ length: 9 }, (_, r) =>
        Array.from({ length: 14 }, (_, c) => `<circle cx="${16 + c * 7}" cy="${19 + r * 7}" r="1.3"/>`).join(''),
      ).join('')}
    </g>
  </svg>`,

  // ------------------------------------------------------------------- sensors
  soilCapacitive: `<svg ${VB}>
    <path d="M46 6h28v26l-6 44a8 8 0 0 1-16 0l-6-44Z" fill="#1f6b45" stroke="#144a2f"/>
    <rect x="50" y="9" width="20" height="6" rx="1" fill="#15181c"/>
    ${header(51.5, 10.2, 3, 6)}
    <path d="M52 26h16v10H52z" fill="#c9a227" opacity="0.35"/>
    <text x="60" y="46" font-family="monospace" font-size="4.4" fill="#a9d8bc" text-anchor="middle">CAPACITIVE</text>
    <path d="M55 56h10v18l-5 8-5-8Z" fill="#2b8557"/>
  </svg>`,

  soilResistive: `<svg ${VB}>
    <rect x="40" y="8" width="40" height="18" rx="2" fill="#1c4f7a" stroke="#123653"/>
    ${headerStrip(44, 10, 20, 5)}${header(45, 10.8, 3, 6)}
    <circle cx="72" cy="18" r="2" fill="#e04b3c"/>
    <path d="M48 26v10M72 26v10" stroke="#8b939b" stroke-width="2"/>
    <path d="M44 36h10v34l-5 10-5-10Z" fill="#cfd5db" stroke="#9aa2ab"/>
    <path d="M66 36h10v34l-5 10-5-10Z" fill="#cfd5db" stroke="#9aa2ab"/>
  </svg>`,

  ldr: `<svg ${VB}>
    <circle cx="60" cy="38" r="22" fill="#e8e2d2" stroke="#b9b2a0"/>
    <circle cx="60" cy="38" r="17" fill="#d9762a"/>
    <path d="M46 32c4 0 4 5 8 5s4-5 8-5 4 5 8 5 4-5 6-5" fill="none" stroke="#3a3229" stroke-width="2.4"/>
    <path d="M46 44c4 0 4 5 8 5s4-5 8-5 4 5 8 5 4-5 6-5" fill="none" stroke="#3a3229" stroke-width="2.4"/>
    <path d="M52 59v22M68 59v22" stroke="#b6bdc4" stroke-width="2.4"/>
  </svg>`,

  dht22: `<svg ${VB}>
    <rect x="34" y="10" width="52" height="52" rx="3" fill="#f0f2f4" stroke="#c3c9cf"/>
    <g fill="#c9ced4">
      ${Array.from({ length: 6 }, (_, r) =>
        Array.from({ length: 6 }, (_, c) =>
          `<rect x="${40 + c * 7}" y="${16 + r * 7}" width="4.6" height="4.6" rx="1"/>`,
        ).join(''),
      ).join('')}
    </g>
    <text x="60" y="70" font-family="monospace" font-size="5" fill="#7d858c" text-anchor="middle">AM2302</text>
    <path d="M44 62v18M52 62v18M60 62v18M68 62v18" stroke="#c9a227" stroke-width="2.4"/>
  </svg>`,

  dht11: `<svg ${VB}>
    <rect x="36" y="10" width="48" height="50" rx="3" fill="#2f74c0" stroke="#1e5490"/>
    <g fill="#5a97d6">
      ${Array.from({ length: 5 }, (_, r) =>
        Array.from({ length: 5 }, (_, c) =>
          `<rect x="${43 + c * 7.4}" y="${17 + r * 7.4}" width="4.8" height="4.8" rx="1"/>`,
        ).join(''),
      ).join('')}
    </g>
    <path d="M50 60v20M60 60v20M70 60v20" stroke="#c9a227" stroke-width="2.4"/>
  </svg>`,

  ds18b20: `<svg ${VB}>
    <rect x="16" y="34" width="46" height="16" rx="8" fill="#c8ced5" stroke="#9aa2ab"/>
    <rect x="20" y="37" width="8" height="10" rx="2" fill="#aeb6bd"/>
    <path d="M62 42h44" stroke="#1b1e22" stroke-width="9" stroke-linecap="round"/>
    <path d="M62 42h44" stroke="#31363c" stroke-width="4" stroke-linecap="round"/>
  </svg>`,

  ultrasonic: `<svg ${VB}>
    <rect x="14" y="20" width="92" height="44" rx="2" fill="#1c4f7a" stroke="#123653"/>
    <circle cx="38" cy="42" r="15" fill="#8b939b" stroke="#666e76"/>
    <circle cx="38" cy="42" r="11" fill="#3c4249"/>
    <circle cx="82" cy="42" r="15" fill="#8b939b" stroke="#666e76"/>
    <circle cx="82" cy="42" r="11" fill="#3c4249"/>
    <rect x="52" y="34" width="16" height="16" rx="1" fill="#141a20"/>
    ${headerStrip(46, 64, 28, 6)}${header(47.5, 65.2, 4, 6)}
  </svg>`,

  rainSensor: `<svg ${VB}>
    <rect x="18" y="14" width="84" height="52" rx="2" fill="#1a6b4a" stroke="#0f4a32"/>
    <g stroke="#c9a227" stroke-width="2.6" fill="none">
      ${Array.from({ length: 9 }, (_, i) => `<path d="M${24 + i * 9} 20v40"/>`).join('')}
    </g>
    <path d="M40 30l5 8h-10Z" fill="#6fc3f0" opacity="0.85"/>
    <path d="M70 44l5 8h-10Z" fill="#6fc3f0" opacity="0.85"/>
  </svg>`,

  waterLevel: `<svg ${VB}>
    <rect x="44" y="6" width="32" height="24" rx="2" fill="#1c4f7a" stroke="#123653"/>
    ${headerStrip(50, 8, 20, 5)}${header(51, 8.8, 3, 6)}
    <rect x="48" y="30" width="24" height="54" rx="2" fill="#0f3a5c"/>
    <g stroke="#c9a227" stroke-width="2">
      ${Array.from({ length: 10 }, (_, i) => `<path d="M52 ${35 + i * 5}h16"/>`).join('')}
    </g>
  </svg>`,

  // ----------------------------------------------------------------- switching
  relay1ch: `<svg ${VB}>
    <rect x="10" y="18" width="100" height="52" rx="2" fill="#1b4f8c" stroke="#123a68"/>
    <!-- the relay can itself -->
    <rect x="52" y="24" width="40" height="34" rx="1.5" fill="#2f6fd0" stroke="#1d4b93"/>
    <rect x="55" y="27" width="34" height="12" rx="1" fill="#3f80e0" opacity="0.55"/>
    <text x="72" y="50" font-family="monospace" font-size="4.4" fill="#dce9fb" text-anchor="middle">SRD-05VDC</text>
    <!-- green screw terminal block -->
    <rect x="12" y="24" width="34" height="34" rx="1.5" fill="#2f8b4a" stroke="#1e6534"/>
    <circle cx="21" cy="34" r="3.4" fill="#c8ced5"/><path d="M18.6 34h4.8" stroke="#5c646c" stroke-width="1.2"/>
    <circle cx="34" cy="34" r="3.4" fill="#c8ced5"/><path d="M31.6 34h4.8" stroke="#5c646c" stroke-width="1.2"/>
    <circle cx="27" cy="48" r="3.4" fill="#c8ced5"/><path d="M24.6 48h4.8" stroke="#5c646c" stroke-width="1.2"/>
    <circle cx="99" cy="30" r="2.2" fill="#e04b3c"/>
    ${headerStrip(94, 56, 6, 14)}${header(95.3, 58, 3, 5, true)}
  </svg>`,

  mosfetIRF520: `<svg ${VB}>
    <rect x="16" y="20" width="88" height="48" rx="2" fill="#1b4f8c" stroke="#123a68"/>
    <!-- TO-220 device with its metal tab -->
    <rect x="46" y="26" width="26" height="14" rx="1" fill="#b6bdc4" stroke="#8b939b"/>
    <circle cx="59" cy="32" r="3" fill="#7e868e"/>
    <rect x="46" y="40" width="26" height="18" rx="1" fill="#1b1e22"/>
    <path d="M51 58v6M59 58v6M67 58v6" stroke="#b6bdc4" stroke-width="2.4"/>
    <rect x="80" y="30" width="18" height="24" rx="1.5" fill="#2f8b4a" stroke="#1e6534"/>
    <circle cx="89" cy="37" r="3" fill="#c8ced5"/><circle cx="89" cy="47" r="3" fill="#c8ced5"/>
    ${headerStrip(20, 46, 6, 16)}${header(21.3, 48, 3, 5, true)}
  </svg>`,

  a4988: `<svg ${VB}>
    <rect x="34" y="14" width="52" height="62" rx="2" fill="#1a5c3a" stroke="#0f3d26"/>
    <rect x="46" y="30" width="28" height="26" rx="1" fill="#1b1e22"/>
    <text x="60" y="46" font-family="monospace" font-size="4.6" fill="#8e959c" text-anchor="middle">A4988</text>
    <circle cx="60" cy="22" r="4" fill="#c8ced5" stroke="#8b939b"/><path d="M57.5 22h5" stroke="#5c646c"/>
    ${headerStrip(34, 60, 52, 6)}${header(36, 61.3, 8, 6)}
    ${headerStrip(34, 16, 6, 12)}${header(35.3, 17.5, 2, 5, true)}
  </svg>`,

  // ----------------------------------------------------------------- actuators
  pump12v: `<svg ${VB}>
    <rect x="34" y="18" width="46" height="52" rx="4" fill="#22262b" stroke="#14171a"/>
    <rect x="38" y="24" width="38" height="10" rx="2" fill="#31363c"/>
    <g stroke="#3d434a" stroke-width="1.6">
      ${Array.from({ length: 5 }, (_, i) => `<path d="M38 ${40 + i * 6}h38"/>`).join('')}
    </g>
    <!-- outlet spout -->
    <path d="M80 30h16v12H80z" fill="#2b3036" stroke="#181b1f"/>
    <rect x="94" y="28" width="8" height="16" rx="2" fill="#3a4047"/>
    <!-- suction cups on the base -->
    <circle cx="44" cy="74" r="4" fill="#1a1d21"/><circle cx="70" cy="74" r="4" fill="#1a1d21"/>
    <!-- two-core lead -->
    <path d="M34 34c-12 0-16 6-22 8" stroke="#c0392b" stroke-width="2.6" fill="none"/>
    <path d="M34 40c-12 0-16 6-22 8" stroke="#1b1e22" stroke-width="2.6" fill="none"/>
  </svg>`,

  servoSG90: `<svg ${VB}>
    <rect x="34" y="26" width="40" height="42" rx="2" fill="#2f74c0" stroke="#1e5490"/>
    <rect x="26" y="34" width="8" height="12" rx="1.5" fill="#3f83cd"/>
    <rect x="74" y="34" width="8" height="12" rx="1.5" fill="#3f83cd"/>
    <circle cx="54" cy="24" r="9" fill="#3f83cd" stroke="#1e5490"/>
    <circle cx="54" cy="24" r="4" fill="#e8eef4"/>
    <path d="M54 24h26" stroke="#e8eef4" stroke-width="5" stroke-linecap="round"/>
    <path d="M74 68c-8 8-16 10-26 12" stroke="#e0a83c" stroke-width="2.2" fill="none"/>
    <path d="M70 68c-8 8-16 10-26 12" stroke="#c0392b" stroke-width="2.2" fill="none"/>
    <path d="M66 68c-8 8-16 10-26 12" stroke="#8b939b" stroke-width="2.2" fill="none"/>
  </svg>`,

  nema17: `<svg ${VB}>
    <rect x="30" y="14" width="60" height="60" rx="3" fill="#22262b" stroke="#14171a"/>
    <g stroke="#31363c" stroke-width="2">
      ${Array.from({ length: 7 }, (_, i) => `<path d="M${36 + i * 8} 20v48"/>`).join('')}
    </g>
    <circle cx="60" cy="44" r="13" fill="#2c3138"/>
    <circle cx="60" cy="44" r="6" fill="#b6bdc4"/>
    <circle cx="37" cy="21" r="2.4" fill="#3d434a"/><circle cx="83" cy="21" r="2.4" fill="#3d434a"/>
    <circle cx="37" cy="67" r="2.4" fill="#3d434a"/><circle cx="83" cy="67" r="2.4" fill="#3d434a"/>
  </svg>`,

  gantryKit: `<svg ${VB}>
    <rect x="10" y="20" width="100" height="8" rx="2" fill="#9aa2ab" stroke="#7a828b"/>
    <rect x="10" y="62" width="100" height="8" rx="2" fill="#9aa2ab" stroke="#7a828b"/>
    <rect x="52" y="20" width="9" height="50" rx="2" fill="#b6bdc4" stroke="#8b939b"/>
    <rect x="46" y="38" width="22" height="16" rx="2" fill="#2f74c0" stroke="#1e5490"/>
    <rect x="14" y="16" width="14" height="16" rx="2" fill="#22262b"/>
    <rect x="14" y="58" width="14" height="16" rx="2" fill="#22262b"/>
    <path d="M20 28v34" stroke="#31363c" stroke-width="2" stroke-dasharray="3 3"/>
  </svg>`,

  solenoidValve: `<svg ${VB}>
    <rect x="44" y="12" width="32" height="30" rx="3" fill="#22262b" stroke="#14171a"/>
    <rect x="48" y="16" width="24" height="8" rx="1.5" fill="#31363c"/>
    <path d="M12 46h96v18H12z" fill="#8b939b" stroke="#6d757d"/>
    <rect x="52" y="42" width="16" height="8" fill="#6d757d"/>
    <circle cx="24" cy="55" r="7" fill="#7a828b" stroke="#5d646c"/>
    <circle cx="96" cy="55" r="7" fill="#7a828b" stroke="#5d646c"/>
    <path d="M44 20c-10 0-14 4-20 6" stroke="#c0392b" stroke-width="2.4" fill="none"/>
  </svg>`,

  // --------------------------------------------------------------------- power
  solar20: `<svg ${VB}>
    <defs><linearGradient id="cellG" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2a4c8f"/><stop offset="0.5" stop-color="#16305e"/>
      <stop offset="1" stop-color="#274785"/></linearGradient></defs>
    <rect x="8" y="12" width="104" height="66" rx="2" fill="#c8ced5" stroke="#9aa2ab"/>
    <rect x="12" y="16" width="96" height="58" fill="url(#cellG)"/>
    <g stroke="#c8ced5" stroke-width="0.9" opacity="0.75">
      ${Array.from({ length: 5 }, (_, c) => `<path d="M${12 + c * 19.2} 16v58"/>`).join('')}
      ${Array.from({ length: 3 }, (_, r) => `<path d="M12 ${16 + r * 19.3}h96"/>`).join('')}
    </g>
    <g stroke="#dfe4e9" stroke-width="1.6" opacity="0.5">
      <path d="M12 30h96"/><path d="M12 45h96"/><path d="M12 60h96"/>
    </g>
  </svg>`,

  lifepo4_7: `<svg ${VB}>
    <rect x="18" y="16" width="84" height="58" rx="3" fill="#25292f" stroke="#14171a"/>
    <rect x="24" y="22" width="72" height="26" rx="2" fill="#31363c"/>
    <text x="60" y="34" font-family="monospace" font-size="6" fill="#7fe0a8" text-anchor="middle">LiFePO4</text>
    <text x="60" y="43" font-family="monospace" font-size="5" fill="#9aa2ab" text-anchor="middle">12.8V 7Ah</text>
    <rect x="30" y="54" width="16" height="12" rx="1.5" fill="#c0392b"/>
    <text x="38" y="63" font-family="monospace" font-size="7" fill="#fff" text-anchor="middle">+</text>
    <rect x="74" y="54" width="16" height="12" rx="1.5" fill="#1b1e22"/>
    <text x="82" y="63.5" font-family="monospace" font-size="8" fill="#c8ced5" text-anchor="middle">−</text>
  </svg>`,

  buck: `<svg ${VB}>
    <rect x="18" y="22" width="84" height="46" rx="2" fill="#1b4f8c" stroke="#123a68"/>
    <circle cx="44" cy="42" r="12" fill="#2b2f34" stroke="#1a1d21"/>
    <circle cx="44" cy="42" r="6.5" fill="#1b4f8c"/>
    <g stroke="#c9a227" stroke-width="2.2">
      <path d="M36 34l16 16"/><path d="M52 34L36 50"/>
    </g>
    <rect x="62" y="30" width="14" height="10" rx="1" fill="#1b1e22"/>
    <rect x="62" y="46" width="16" height="14" rx="1.5" fill="#2f8b4a"/>
    <circle cx="70" cy="53" r="3.6" fill="#c8ced5"/><path d="M67.4 53h5.2" stroke="#5c646c"/>
    <rect x="84" y="34" width="12" height="12" rx="1" fill="#c9a227" opacity="0.6"/>
  </svg>`,

  // -------------------------------------------------------------------- output
  oledSSD1306: `<svg ${VB}>
    <rect x="26" y="14" width="68" height="56" rx="2" fill="#1a1d21" stroke="#0d0f12"/>
    <rect x="31" y="24" width="58" height="34" rx="1" fill="#05070a"/>
    <g fill="#4fd6f0">
      <rect x="36" y="30" width="24" height="3.4" rx="1"/>
      <rect x="36" y="37" width="40" height="3.4" rx="1"/>
      <rect x="36" y="44" width="17" height="3.4" rx="1"/>
    </g>
    ${headerStrip(44, 62, 28, 6)}${header(45.5, 63.2, 4, 6)}
  </svg>`,

  lcd1602: `<svg ${VB}>
    <rect x="10" y="16" width="100" height="52" rx="2" fill="#1a5c3a" stroke="#0f3d26"/>
    <rect x="18" y="24" width="84" height="34" rx="1" fill="#5fc46a" stroke="#3f9a4a"/>
    <g fill="#123b1d" opacity="0.8">
      ${Array.from({ length: 16 }, (_, c) => `<rect x="${21 + c * 5.1}" y="29" width="3.4" height="8" rx="0.5"/>`).join('')}
      ${Array.from({ length: 16 }, (_, c) => `<rect x="${21 + c * 5.1}" y="43" width="3.4" height="8" rx="0.5"/>`).join('')}
    </g>
    ${headerStrip(14, 68, 24, 6)}${header(15.5, 69.2, 4, 6)}
  </svg>`,

  ledRed: `<svg ${VB}>
    <path d="M48 44a12 12 0 0 1 24 0v14H48Z" fill="#e04b3c" opacity="0.9"/>
    <ellipse cx="60" cy="58" rx="12" ry="3.4" fill="#c0392b"/>
    <path d="M52 61v22M68 61v16" stroke="#b6bdc4" stroke-width="2.4"/>
    <ellipse cx="55" cy="40" rx="3" ry="5" fill="#fff" opacity="0.35"/>
  </svg>`,

  buzzer: `<svg ${VB}>
    <ellipse cx="60" cy="40" rx="24" ry="24" fill="#1b1e22" stroke="#0d0f12"/>
    <ellipse cx="60" cy="38" rx="24" ry="22" fill="#25292f"/>
    <circle cx="60" cy="38" r="4" fill="#0a0c0e"/>
    <path d="M54 62v20M66 62v20" stroke="#b6bdc4" stroke-width="2.4"/>
  </svg>`,

  res10k: `<svg ${VB}>
    <path d="M14 45h22M84 45h22" stroke="#b6bdc4" stroke-width="2.6"/>
    <rect x="36" y="33" width="48" height="24" rx="10" fill="#d9c9a3" stroke="#b3a281"/>
    <rect x="44" y="33" width="5" height="24" fill="#8a5a2b"/>
    <rect x="53" y="33" width="5" height="24" fill="#1b1e22"/>
    <rect x="62" y="33" width="5" height="24" fill="#d94b3c"/>
    <rect x="74" y="33" width="5" height="24" fill="#c9a227"/>
  </svg>`,

  // ------------------------------------------------------------------ plumbing
  waterTank: `<svg ${VB}>
    <path d="M26 20h68v52a6 6 0 0 1-6 6H32a6 6 0 0 1-6-6Z" fill="#3a6fa8" stroke="#26507c"/>
    <ellipse cx="60" cy="20" rx="34" ry="8" fill="#4d84bd" stroke="#26507c"/>
    <rect x="50" y="12" width="20" height="8" rx="2" fill="#2b5b8c"/>
    <path d="M32 44h56" stroke="#6fa9dd" stroke-width="2" opacity="0.6"/>
    <path d="M94 66h12v6H94z" fill="#8b939b"/>
  </svg>`,

  sprinklerHead: `<svg ${VB}>
    <path d="M54 40h12v42H54z" fill="#8b939b" stroke="#6d757d"/>
    <ellipse cx="60" cy="82" rx="18" ry="4" fill="#6d757d"/>
    <path d="M50 34h20v8H50z" fill="#2f8b4a" stroke="#1e6534"/>
    <g stroke="#6fc3f0" stroke-width="2.2" fill="none" opacity="0.85">
      <path d="M50 32C40 24 30 22 22 26"/><path d="M70 32c10-8 20-10 28-6"/><path d="M60 30V16"/>
    </g>
  </svg>`,

  tubing: `<svg ${VB}>
    <path d="M14 62c14-34 34-34 46-18s26 20 46-4" fill="none" stroke="#2b6fa8" stroke-width="9" stroke-linecap="round"/>
    <path d="M14 62c14-34 34-34 46-18s26 20 46-4" fill="none" stroke="#4d92cd" stroke-width="4.5" stroke-linecap="round"/>
  </svg>`,

  wireMM: `<svg ${VB}>
    <path d="M12 30c22-14 44 18 66 4" fill="none" stroke="#d94b3c" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M12 44c22-14 44 18 66 4" fill="none" stroke="#1b1e22" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M12 58c22-14 44 18 66 4" fill="none" stroke="#e0a83c" stroke-width="3.4" stroke-linecap="round"/>
    <g fill="#c9a227">
      <rect x="76" y="27" width="16" height="3" rx="1"/><rect x="76" y="41" width="16" height="3" rx="1"/>
      <rect x="76" y="55" width="16" height="3" rx="1"/>
    </g>
  </svg>`,
}

// Parts that share a silhouette with one already drawn.
const ALIASES: Record<string, string> = {
  esp32s3: 'esp32',
  nano: 'unoR3',
  breadboardHalf: 'breadboardFull',
  wireMF: 'wireMM',
  wireDirect: 'wireMM',
  relay2ch: 'relay1ch',
  solar10: 'solar20',
  solar50: 'solar20',
  lifepo4_20: 'lifepo4_7',
  lifepo4_40: 'lifepo4_7',
  pwmController: 'buck',
  mpptController: 'buck',
  reg7805: 'mosfetIRF520',
  pump5v: 'pump12v',
  stepper28byj: 'nema17',
  dcFan: 'nema17',
  l298n: 'a4988',
  gantryRail: 'gantryKit',
  ledGreen: 'ledRed',
  ledRGB: 'ledRed',
  res220: 'res10k',
  res1k: 'res10k',
  potentiometer: 'buck',
  diode1N4007: 'res10k',
  cap100uf: 'buzzer',
  pushButton: 'res10k',
  transistor2N2222: 'mosfetIRF520',
  bmp280: 'oledSSD1306',
  floatSwitch: 'waterLevel',
  flowMeter: 'solenoidValve',
  dripEmitter: 'tubing',
  terminalBlock: 'wireMM',
}

/** Neutral placeholder for any part without dedicated art. */
function fallback(category: Category): string {
  return `<svg ${VB}>
    <rect x="24" y="22" width="72" height="46" rx="3" fill="#1f242a" stroke="#333a42"/>
    <rect x="30" y="28" width="60" height="34" rx="2" fill="#262c33"/>
    <text x="60" y="48" font-family="monospace" font-size="6" fill="#6b747d" text-anchor="middle">
      ${category.toUpperCase()}</text>
  </svg>`
}

export function componentArt(partId: string, category: Category): string {
  const key = ALIASES[partId] ?? partId
  return ART[key] ?? fallback(category)
}

export function hasDedicatedArt(partId: string): boolean {
  return !!(ART[ALIASES[partId] ?? partId])
}
