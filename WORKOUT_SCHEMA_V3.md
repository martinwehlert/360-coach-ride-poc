# 360° Coach – Workout Schema v3

## Ziel
Workoutdefinitionen sind primär relativ zur aktuellen Cycling-FTP und damit unabhängig von einem festen Wattwert. Die App löst Prozentziele beim Laden gegen `athlete-config.json` in konkrete ERG-Wattwerte auf.

## Target-Typen

### Standard: FTP-Prozent
```json
"target": {
  "type": "ftpPercent",
  "value": 0.70,
  "low": 0.68,
  "high": 0.72
}
```

### Ausnahme: absolute Leistung
```json
"target": {
  "type": "absolutePower",
  "value": 180
}
```

`targetPower` wird von der App als Runtime-Wert erzeugt und soll in neuen v3-Dateien nicht manuell gepflegt werden.

## Pflichtfelder
- `schemaVersion`: 3
- `id`: stabile eindeutige Workout-ID
- `name`
- `sport`
- `description`
- `classification`
- `steps`

## Classification
```json
"classification": {
  "primaryGoal": "threshold",
  "secondaryGoals": ["muscular-endurance"],
  "recommendedPhases": ["base", "build"],
  "expectedSessionRpe": 7,
  "tags": ["threshold", "erg", "time-efficient"]
}
```

Saisonphasen sind Eignungsangaben, keine exklusiven biologischen Kategorien. Ein Workout kann mehreren Phasen zugeordnet werden.

## Automatisch berechenbare Library-Metriken
Die App berechnet aus den Steps:
- Gesamtdauer
- zeitgewichtete durchschnittliche Intensität in %FTP
- Peak-Intensität in %FTP
- aktuelle Wattentsprechung auf Basis der Athlete-Config

Diese Werte sollen nicht redundant manuell in jeder Workoutdatei gepflegt werden.

## Planungsdaten getrennt halten
Workoutdefinition und Wochenplanung sind getrennte Ebenen:
- `workouts/library-index.json`: Bibliotheksindex
- `workouts/week-plan.json`: Referenzen auf Workout-IDs für die aktuelle Woche

Damit kann dasselbe Workout in beliebigen Wochen wiederverwendet werden.
