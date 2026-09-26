"""FarmAdvisor lookup tables mirrored from src/core/farmAdvisor.ts.

Pinned to the TypeScript source by tests/test_engine_drift.py: edit both together.
"""

#: Ignore illiquid noise: an item that barely trades cannot be sold (MIN_VOLUME).
MIN_VOLUME = 50

#: ninja item id -> the activity that actually drops it (SOURCE_OVERRIDES). ninja's category is
#: not always the drop source; see the TS file for the verification notes behind each entry.
SOURCE_OVERRIDES: dict[str, str] = {
    "omen-of-light": "Abyss",
    "omen-of-abyssal-echoes": "Abyss",
    "omen-of-sinistral-necromancy": "Abyss",
    "omen-of-dextral-necromancy": "Abyss",
    "omen-of-putrefaction": "Abyss",
    "omen-of-the-liege": "Abyss",
    "omen-of-the-sovereign": "Abyss",
    "omen-of-the-blackblooded": "Abyss",
    "essence-of-the-abyss": "Abyss",
    "astrids-creativity": "Expedition",
}

#: ninja category -> (activity label, how-to hint) (FARM_LABELS).
FARM_LABELS: dict[str, tuple[str, str]] = {
    "Abyss": ("Abyss", "spawn & re-run Abyssal bosses (Abyssal Bones)"),
    "Breach": ("Breach", "open Breaches, bank Catalysts"),
    "Expedition": ("Expedition", "blow up Expedition logbooks / remnants"),
    "Ritual": ("Ritual", "run Rituals, reroll for Omens"),
    "Essences": ("Essence", "hunt Essence monsters"),
    "Runes": ("Runes", "rune drops / corruption"),
    "SoulCores": ("Soul Cores", "farm pinnacle/boss Soul Cores"),
    "Fragments": ("Fragments", "boss fragments (Kulemak etc.)"),
    "UncutGems": ("Uncut Gems", "gem drops from maps/bosses"),
    "Idols": ("Idols", "Idol drops"),
    "Verisium": ("Verisium", "Verisium sources"),
    "Currency": ("Currency", "general currency drops (the trade medium)"),
}
