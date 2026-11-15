import math
from typing import Optional, List, Dict, Any

# BMTC Fare Stages (Ordinary vs Vajra AC)
# Ordinary (Non-AC):
# Up to 2 km: ₹5, up to 4 km: ₹10, up to 6 km: ₹15, up to 10 km: ₹20, up to 14 km: ₹25, up to 18 km: ₹30, 20+ km: ₹35
# Vajra (Volvo AC):
# Up to 2 km: ₹15, up to 4 km: ₹20, up to 8 km: ₹30, up to 12 km: ₹45, up to 18 km: ₹60, up to 25 km: ₹80, 25+ km: ₹100

def calculate_haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    earth_radius = 6371.0
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return earth_radius * c


def estimate_bmtc_fare(distance_km: float) -> Dict[str, Any]:
    # Ordinary bus fare
    if distance_km <= 2:
        ord_fare = 5
    elif distance_km <= 4:
        ord_fare = 10
    elif distance_km <= 6:
        ord_fare = 15
    elif distance_km <= 10:
        ord_fare = 20
    elif distance_km <= 14:
        ord_fare = 25
    elif distance_km <= 18:
        ord_fare = 30
    else:
        ord_fare = 35

    # Vajra AC bus fare
    if distance_km <= 2:
        ac_fare = 15
    elif distance_km <= 4:
        ac_fare = 20
    elif distance_km <= 8:
        ac_fare = 30
    elif distance_km <= 12:
        ac_fare = 45
    elif distance_km <= 18:
        ac_fare = 60
    elif distance_km <= 25:
        ac_fare = 80
    else:
        ac_fare = 100

    return {
        "distance_km": round(distance_km, 1),
        "ordinary_fare_inr": ord_fare,
        "vajra_ac_fare_inr": ac_fare,
        "pass_accepted": True,
        "currency": "INR",
    }


# ── Comprehensive Bengaluru BMTC Stops Master Catalog ────────────────────────
BMTC_STOPS_CATALOG = {
    "majestic": {
        "stop_id": "ST_MAJESTIC",
        "name": "Kempegowda Bus Station (Majestic)",
        "kannada_name": "ಕೆಂಪೇಗೌಡ ಬಸ್ ನಿಲ್ದಾಣ (ಮೆಜೆಸ್ಟಿಕ್)",
        "latitude": 12.9778,
        "longitude": 77.5713,
        "aliases": ["majestic", "kbs", "kempegowda", "city railway station", "sangam theatre"],
    },
    "silk_board": {
        "stop_id": "ST_SILK_BOARD",
        "name": "Central Silk Board",
        "kannada_name": "ಸೆಂಟ್ರಲ್ ಸಿಲ್ಕ್ ಬೋರ್ಡ್",
        "latitude": 12.9176,
        "longitude": 77.6233,
        "aliases": ["silk board", "central silk board", "csb", "silkboard"],
    },
    "hebbal": {
        "stop_id": "ST_HEBBAL",
        "name": "Hebbal Flyover Bus Stop",
        "kannada_name": "ಹೆಬ್ಬಾಳ ಫ್ಲೈಓವರ್",
        "latitude": 13.0358,
        "longitude": 77.5970,
        "aliases": ["hebbal", "hebbala", "hebbal bridge", "hebbal lake"],
    },
    "whitefield": {
        "stop_id": "ST_WHITEFIELD",
        "name": "Whitefield (TTMC / Kadugodi)",
        "kannada_name": "ವೈಟ್‌ಫೀಲ್ಡ್ (ಕಾಡುಗೋಡಿ)",
        "latitude": 12.9698,
        "longitude": 77.7499,
        "aliases": ["whitefield", "itpl", "kadugodi", "hope farm", "gr tech park"],
    },
    "electronic_city": {
        "stop_id": "ST_ECITY",
        "name": "Electronic City Toll Gate",
        "kannada_name": "ಎಲೆಕ್ಟ್ರಾನಿಕ್ ಸಿಟಿ ಟೋಲ್ ಗೇಟ್",
        "latitude": 12.8452,
        "longitude": 77.6602,
        "aliases": ["electronic city", "ecity", "e-city", "wipro gate", "infosys gate", "electronic city phase 1"],
    },
    "marathahalli": {
        "stop_id": "ST_MARATHAHALLI",
        "name": "Marathahalli Bridge",
        "kannada_name": "ಮಾರತಹಳ್ಳಿ ಸೇತುವೆ",
        "latitude": 12.9562,
        "longitude": 77.7011,
        "aliases": ["marathahalli", "marathahalli bridge", "marathalli", "kalamandir"],
    },
    "banashankari": {
        "stop_id": "ST_BANASHANKARI",
        "name": "Banashankari TTMC",
        "kannada_name": "ಬನಶಂಕರಿ ಟಿಟಿಎಂಸಿ",
        "latitude": 12.9177,
        "longitude": 77.5738,
        "aliases": ["banashankari", "bsk", "banashankari bus stand", "banashankari temple"],
    },
    "shivajinagar": {
        "stop_id": "ST_SHIVAJINAGAR",
        "name": "Shivajinagar Bus Station",
        "kannada_name": "ಶಿವಾಜಿನಗರ ಬಸ್ ನಿಲ್ದಾಣ",
        "latitude": 12.9856,
        "longitude": 77.6057,
        "aliases": ["shivajinagar", "russell market", "shivaji nagar"],
    },
    "kr_puram": {
        "stop_id": "ST_KR_PURAM",
        "name": "KR Puram Railway Station / Tin Factory",
        "kannada_name": "ಕೆ ಆರ್ ಪುರಂ ರೈಲ್ವೆ ನಿಲ್ದಾಣ / ಟಿನ್ ಫ್ಯಾಕ್ಟರಿ",
        "latitude": 13.0035,
        "longitude": 77.6744,
        "aliases": ["kr puram", "tin factory", "iti gate", "krishnarajapuram", "kasturi nagar"],
    },
    "jayanagar": {
        "stop_id": "ST_JAYANAGAR",
        "name": "Jayanagar 4th Block TTMC",
        "kannada_name": "ಜಯನಗರ ೪ನೇ ಬ್ಲಾಕ್",
        "latitude": 12.9298,
        "longitude": 77.5828,
        "aliases": ["jayanagar", "jayanagar 4th block", "jayanagara", "south end circle"],
    },
    "yeshwantpur": {
        "stop_id": "ST_YESHWANTPUR",
        "name": "Yeshwantpur TTMC / Railway Station",
        "kannada_name": "ಯಶವಂತಪುರ ಟಿಟಿಎಂಸಿ",
        "latitude": 13.0238,
        "longitude": 77.5501,
        "aliases": ["yeshwantpur", "yeshwanthpur", "govardhan theatre", "yeshwantpur metro"],
    },
    "airport": {
        "stop_id": "ST_AIRPORT",
        "name": "Kempegowda International Airport (KIA)",
        "kannada_name": "ಕೆಂಪೇಗೌಡ ಅಂತರರಾಷ್ಟ್ರೀಯ ವಿಮಾನ ನಿಲ್ದಾಣ",
        "latitude": 13.1986,
        "longitude": 77.7066,
        "aliases": ["airport", "kia", "bial", "bangalore airport", "terminal 1", "terminal 2", "aerodrome"],
    },
    "indiranagar": {
        "stop_id": "ST_INDIRANAGAR",
        "name": "Indiranagar 100ft Road / CMH Road",
        "kannada_name": "ಇಂದಿರಾನಗರ",
        "latitude": 12.9784,
        "longitude": 77.6408,
        "aliases": ["indiranagar", "indira nagar", "100ft road", "cmh road", "domlur flyover"],
    },
    "koramangala": {
        "stop_id": "ST_KORAMANGALA",
        "name": "Koramangala (Sony World Junction)",
        "kannada_name": "ಕೋರಮಂಗಲ (ಸೋನಿ ವರ್ಲ್ಡ್)",
        "latitude": 12.9352,
        "longitude": 77.6245,
        "aliases": ["koramangala", "sony world", "koramangala water tank", "forum mall"],
    },
    "bellandur": {
        "stop_id": "ST_BELLANDUR",
        "name": "Bellandur EcoSpace / Gate",
        "kannada_name": "ಬೆಳ್ಳಂದೂರು ಇಕೋಸ್ಪೇಸ್",
        "latitude": 12.9304,
        "longitude": 77.6784,
        "aliases": ["bellandur", "ecospace", "bellanduru", "central mall bellandur"],
    },
    "ms_palya": {
        "stop_id": "ST_MS_PALYA",
        "name": "MS Palya Junction",
        "kannada_name": "ಎಂ ಎಸ್ ಪಾಲ್ಯ",
        "latitude": 13.0782,
        "longitude": 77.5453,
        "aliases": ["ms palya", "m s palya", "ms palya cross", "vidyaranyapura", "bel layout"],
    },
    "sambhram_college": {
        "stop_id": "ST_SAMBHRAM",
        "name": "Sambram College Gate",
        "kannada_name": "ಸಂಭ್ರಮ್ ಕಾಲೇಜು ಗೇಟ್",
        "latitude": 13.0870,
        "longitude": 77.5500,
        "aliases": [
            "sambhram college",
            "sambram college",
            "sambhram",
            "sambram",
            "sambhram college bus stop",
            "sambram college gate",
            "sambhram institute",
        ],
    },
    "yelahanka": {
        "stop_id": "ST_YELAHANKA",
        "name": "Yelahanka NES / Old Town",
        "kannada_name": "ಯಲಹಂಕ ಎನ್ಇಎಸ್",
        "latitude": 13.1007,
        "longitude": 77.5963,
        "aliases": ["yelahanka", "yelahanka nes", "yelahanka old town", "yelahanka police station"],
    },
    "kengeri": {
        "stop_id": "ST_KENGERI",
        "name": "Kengeri TTMC Bus Stand",
        "kannada_name": "ಕೆಂಗೇರಿ ಟಿಟಿಎಂಸಿ",
        "latitude": 12.9081,
        "longitude": 77.4851,
        "aliases": ["kengeri", "kengeri ttmc", "kengeri satellite town", "mysore road metro"],
    },
    "domlur": {
        "stop_id": "ST_DOMLUR",
        "name": "Domlur TTMC / Flyover",
        "kannada_name": "ದೋಮ್ಲೂರು ಟಿಟಿಎಂಸಿ",
        "latitude": 12.9609,
        "longitude": 77.6387,
        "aliases": ["domlur", "domlur bridge", "command hospital"],
    },
    "kalyan_nagar": {
        "stop_id": "ST_KALYAN_NAGAR",
        "name": "Kalyan Nagar Ring Road",
        "kannada_name": "ಕಲ್ಯಾಣ ನಗರ ರಿಂಗ್ ರೋಡ್",
        "latitude": 13.0232,
        "longitude": 77.6431,
        "aliases": ["kalyan nagar", "kammanahalli cross", "babusapalya"],
    },
    "hsr_layout": {
        "stop_id": "ST_HSR_LAYOUT",
        "name": "HSR Layout BDA Complex",
        "kannada_name": "ಎಚ್ ಎಸ್ ಆರ್ ಲೇಔಟ್",
        "latitude": 12.9116,
        "longitude": 77.6388,
        "aliases": ["hsr", "hsr layout", "hsr bda complex", "agaram"],
    }
}


# ── Full Route Stop Sequences from Source to Destination ─────────────────────
BMTC_ROUTES_MASTER = {
    "500D": {
        "route_number": "500D",
        "name": "Hebbal to Central Silk Board",
        "description": "Outer Ring Road Express Connecting North & South Tech Corridors",
        "source": "Hebbal Flyover Bus Stop",
        "source_kannada": "ಹೆಬ್ಬಾಳ",
        "destination": "Central Silk Board",
        "destination_kannada": "ಸೆಂಟ್ರಲ್ ಸಿಲ್ಕ್ ಬೋರ್ಡ್",
        "service_type": "Ordinary & Express",
        "frequency": "Every 6 - 8 mins",
        "total_distance_km": 24.5,
        "estimated_duration_min": 65,
        "stops": [
            {"seq": 1, "name": "Hebbal Flyover Bus Stop", "lat": 13.0358, "lng": 77.5970, "dist_km": 0.0},
            {"seq": 2, "name": "Kempapura Hebbal", "lat": 13.0410, "lng": 77.6050, "dist_km": 1.2},
            {"seq": 3, "name": "Veerannapalya", "lat": 13.0402, "lng": 77.6180, "dist_km": 2.7},
            {"seq": 4, "name": "Manyata Tech Park (Main Gate)", "lat": 13.0475, "lng": 77.6210, "dist_km": 3.8},
            {"seq": 5, "name": "Nagavara Junction", "lat": 13.0352, "lng": 77.6250, "dist_km": 5.1},
            {"seq": 6, "name": "HBR Layout BDA Complex", "lat": 13.0280, "lng": 77.6330, "dist_km": 6.4},
            {"seq": 7, "name": "Kalyan Nagar Ring Road", "lat": 13.0232, "lng": 77.6431, "dist_km": 7.8},
            {"seq": 8, "name": "Kammanahalli Cross", "lat": 13.0180, "lng": 77.6490, "dist_km": 8.9},
            {"seq": 9, "name": "Babusapalya", "lat": 13.0140, "lng": 77.6560, "dist_km": 10.1},
            {"seq": 10, "name": "Ramamurthy Nagar Ring Road", "lat": 13.0110, "lng": 77.6650, "dist_km": 11.5},
            {"seq": 11, "name": "Kasturi Nagar", "lat": 13.0070, "lng": 77.6700, "dist_km": 12.4},
            {"seq": 12, "name": "Tin Factory (KR Puram)", "lat": 13.0035, "lng": 77.6744, "dist_km": 13.5},
            {"seq": 13, "name": "KR Puram Railway Station", "lat": 12.9980, "lng": 77.6780, "dist_km": 14.6},
            {"seq": 14, "name": "Mahadevapura (EMC2)", "lat": 12.9900, "lng": 77.6850, "dist_km": 16.0},
            {"seq": 15, "name": "Doddanekundi Junction", "lat": 12.9730, "lng": 77.6970, "dist_km": 17.8},
            {"seq": 16, "name": "Marathahalli Bridge", "lat": 12.9562, "lng": 77.7011, "dist_km": 19.4},
            {"seq": 17, "name": "Kadubeesanahalli", "lat": 12.9430, "lng": 77.6930, "dist_km": 20.8},
            {"seq": 18, "name": "Devarabisanahalli", "lat": 12.9370, "lng": 77.6870, "dist_km": 21.6},
            {"seq": 19, "name": "Bellandur EcoSpace", "lat": 12.9304, "lng": 77.6784, "dist_km": 22.5},
            {"seq": 20, "name": "Agara Junction", "lat": 12.9230, "lng": 77.6520, "dist_km": 23.4},
            {"seq": 21, "name": "HSR Layout 5th Main", "lat": 12.9160, "lng": 77.6380, "dist_km": 24.0},
            {"seq": 22, "name": "Central Silk Board", "lat": 12.9176, "lng": 77.6233, "dist_km": 24.5},
        ]
    },
    "335E": {
        "route_number": "335E",
        "name": "Kempegowda Bus Station to Kadugodi (ITPL)",
        "description": "Connecting Majestic Central Station to Whitefield Tech Hub",
        "source": "Kempegowda Bus Station (Majestic)",
        "source_kannada": "ಮೆಜೆಸ್ಟಿಕ್",
        "destination": "Whitefield (TTMC / Kadugodi)",
        "destination_kannada": "ಕಾಡುಗೋಡಿ / ಐಟಿಪಿಎಲ್",
        "service_type": "Ordinary & Vajra AC",
        "frequency": "Every 8 - 12 mins",
        "total_distance_km": 22.8,
        "estimated_duration_min": 60,
        "stops": [
            {"seq": 1, "name": "Kempegowda Bus Station (Majestic)", "lat": 12.9778, "lng": 77.5713, "dist_km": 0.0},
            {"seq": 2, "name": "Maharani College", "lat": 12.9760, "lng": 77.5810, "dist_km": 1.1},
            {"seq": 3, "name": "Corporation (Hudson Circle)", "lat": 12.9720, "lng": 77.5890, "dist_km": 2.2},
            {"seq": 4, "name": "Richmond Circle", "lat": 12.9660, "lng": 77.5990, "dist_km": 3.4},
            {"seq": 5, "name": "Mayo Hall / MG Road", "lat": 12.9730, "lng": 77.6100, "dist_km": 4.6},
            {"seq": 6, "name": "Trinity Circle Metro", "lat": 12.9720, "lng": 77.6200, "dist_km": 5.8},
            {"seq": 7, "name": "Domlur TTMC / Flyover", "lat": 12.9609, "lng": 77.6387, "dist_km": 7.4},
            {"seq": 8, "name": "Manipal Hospital Old Airport Rd", "lat": 12.9580, "lng": 77.6490, "dist_km": 8.5},
            {"seq": 9, "name": "Murugeshpalya", "lat": 12.9560, "lng": 77.6590, "dist_km": 9.7},
            {"seq": 10, "name": "HAL Main Gate", "lat": 12.9540, "lng": 77.6710, "dist_km": 11.0},
            {"seq": 11, "name": "Marathahalli Bridge", "lat": 12.9562, "lng": 77.7011, "dist_km": 14.2},
            {"seq": 12, "name": "Kundalahalli Gate", "lat": 12.9620, "lng": 77.7130, "dist_km": 15.8},
            {"seq": 13, "name": "BEML Layout", "lat": 12.9650, "lng": 77.7220, "dist_km": 17.0},
            {"seq": 14, "name": "Varthur Kodi", "lat": 12.9640, "lng": 77.7340, "dist_km": 18.4},
            {"seq": 15, "name": "Hope Farm Junction", "lat": 12.9680, "lng": 77.7420, "dist_km": 20.2},
            {"seq": 16, "name": "ITPL Main Gate", "lat": 12.9860, "lng": 77.7380, "dist_km": 21.6},
            {"seq": 17, "name": "Whitefield (TTMC / Kadugodi)", "lat": 12.9698, "lng": 77.7499, "dist_km": 22.8},
        ]
    },
    "400": {
        "route_number": "400",
        "name": "Kempegowda Bus Station to Airport",
        "description": "Direct North Corridor Express",
        "source": "Kempegowda Bus Station (Majestic)",
        "source_kannada": "ಮೆಜೆಸ್ಟಿಕ್",
        "destination": "Kempegowda International Airport (KIA)",
        "destination_kannada": "ಕೆಂಪೇಗೌಡ ವಿಮಾನ ನಿಲ್ದಾಣ",
        "service_type": "Ordinary & Vayu Vajra",
        "frequency": "Every 15 mins",
        "total_distance_km": 34.0,
        "estimated_duration_min": 75,
        "stops": [
            {"seq": 1, "name": "Kempegowda Bus Station (Majestic)", "lat": 12.9778, "lng": 77.5713, "dist_km": 0.0},
            {"seq": 2, "name": "Anand Rao Circle", "lat": 12.9810, "lng": 77.5750, "dist_km": 0.8},
            {"seq": 3, "name": "Palace Guttahalli", "lat": 12.9970, "lng": 77.5820, "dist_km": 2.6},
            {"seq": 4, "name": "Mekhri Circle", "lat": 13.0130, "lng": 77.5870, "dist_km": 4.5},
            {"seq": 5, "name": "Hebbal Flyover Bus Stop", "lat": 13.0358, "lng": 77.5970, "dist_km": 7.4},
            {"seq": 6, "name": "Kodigehalli Gate", "lat": 13.0560, "lng": 77.5950, "dist_km": 9.8},
            {"seq": 7, "name": "Byatarayanapura", "lat": 13.0720, "lng": 77.5940, "dist_km": 11.6},
            {"seq": 8, "name": "Yelahanka NES", "lat": 13.1007, "lng": 77.5963, "dist_km": 15.0},
            {"seq": 9, "name": "Kogilu Cross", "lat": 13.1180, "lng": 77.6040, "dist_km": 17.2},
            {"seq": 10, "name": "Chikkajala", "lat": 13.1550, "lng": 77.6250, "dist_km": 22.0},
            {"seq": 11, "name": "Sadahalli Gate (Trumpet Flyover)", "lat": 13.1810, "lng": 77.6530, "dist_km": 26.5},
            {"seq": 12, "name": "Kempegowda International Airport (KIA)", "lat": 13.1986, "lng": 77.7066, "dist_km": 34.0},
        ]
    },
    "401": {
        "route_number": "401",
        "name": "Yeshwantpur to Yelahanka via MS Palya",
        "description": "North-West Feeder Route Connecting Residential Belts",
        "source": "Yeshwantpur TTMC / Railway Station",
        "source_kannada": "ಯಶವಂತಪುರ",
        "destination": "Yelahanka NES / Old Town",
        "destination_kannada": "ಯಲಹಂಕ",
        "service_type": "Ordinary & Feeder",
        "frequency": "Every 12 mins",
        "total_distance_km": 16.5,
        "estimated_duration_min": 45,
        "stops": [
            {"seq": 1, "name": "Yeshwantpur TTMC / Railway Station", "lat": 13.0238, "lng": 77.5501, "dist_km": 0.0},
            {"seq": 2, "name": "Gorguntepalya Metro", "lat": 13.0310, "lng": 77.5480, "dist_km": 1.0},
            {"seq": 3, "name": "Jalahalli Cross", "lat": 13.0450, "lng": 77.5400, "dist_km": 2.8},
            {"seq": 4, "name": "Jalahalli Village", "lat": 13.0550, "lng": 77.5380, "dist_km": 4.1},
            {"seq": 5, "name": "BEL Circle", "lat": 13.0610, "lng": 77.5420, "dist_km": 5.2},
            {"seq": 6, "name": "Vidyaranyapura 5th Block", "lat": 13.0720, "lng": 77.5440, "dist_km": 6.8},
            {"seq": 7, "name": "MS Palya Junction", "lat": 13.0782, "lng": 77.5453, "dist_km": 7.9},
            {"seq": 8, "name": "Sambram College Gate", "lat": 13.0870, "lng": 77.5500, "dist_km": 9.2},
            {"seq": 9, "name": "Singanayakanahalli", "lat": 13.0950, "lng": 77.5620, "dist_km": 11.0},
            {"seq": 10, "name": "Yelahanka Satellite Town", "lat": 13.1020, "lng": 77.5810, "dist_km": 13.5},
            {"seq": 11, "name": "Yelahanka NES / Old Town", "lat": 13.1007, "lng": 77.5963, "dist_km": 16.5},
        ]
    },
    "401A": {
        "route_number": "401A",
        "name": "Yeshwantpur to Yelahanka via MS Palya & Sambhram College",
        "description": "North-West Feeder Route Connecting Residential Belts and Colleges",
        "source": "Yeshwantpur TTMC / Railway Station",
        "source_kannada": "ಯಶವಂತಪುರ",
        "destination": "Yelahanka NES / Old Town",
        "destination_kannada": "ಯಲಹಂಕ",
        "service_type": "Ordinary & Feeder",
        "frequency": "Every 10 mins",
        "total_distance_km": 16.5,
        "estimated_duration_min": 45,
        "stops": [
            {"seq": 1, "name": "Yeshwantpur TTMC / Railway Station", "lat": 13.0238, "lng": 77.5501, "dist_km": 0.0},
            {"seq": 2, "name": "Gorguntepalya Metro", "lat": 13.0310, "lng": 77.5480, "dist_km": 1.0},
            {"seq": 3, "name": "Jalahalli Cross", "lat": 13.0450, "lng": 77.5400, "dist_km": 2.8},
            {"seq": 4, "name": "Jalahalli Village", "lat": 13.0550, "lng": 77.5380, "dist_km": 4.1},
            {"seq": 5, "name": "BEL Circle", "lat": 13.0610, "lng": 77.5420, "dist_km": 5.2},
            {"seq": 6, "name": "Vidyaranyapura 5th Block", "lat": 13.0720, "lng": 77.5440, "dist_km": 6.8},
            {"seq": 7, "name": "MS Palya Junction", "lat": 13.0782, "lng": 77.5453, "dist_km": 7.9},
            {"seq": 8, "name": "Sambram College Gate", "lat": 13.0870, "lng": 77.5500, "dist_km": 9.2},
            {"seq": 9, "name": "Singanayakanahalli", "lat": 13.0950, "lng": 77.5620, "dist_km": 11.0},
            {"seq": 10, "name": "Yelahanka Satellite Town", "lat": 13.1020, "lng": 77.5810, "dist_km": 13.5},
            {"seq": 11, "name": "Yelahanka NES / Old Town", "lat": 13.1007, "lng": 77.5963, "dist_km": 16.5},
        ]
    },
    "365": {
        "route_number": "365",
        "name": "Kempegowda Bus Station to Bannerghatta / Jigani",
        "description": "South Transit Trunk to National Park and Industrial Zone",
        "source": "Kempegowda Bus Station (Majestic)",
        "source_kannada": "ಮೆಜೆಸ್ಟಿಕ್",
        "destination": "Bannerghatta National Park",
        "destination_kannada": "ಬನ್ನೇರುಘಟ್ಟ",
        "service_type": "Ordinary & Vajra",
        "frequency": "Every 10 mins",
        "total_distance_km": 21.0,
        "estimated_duration_min": 55,
        "stops": [
            {"seq": 1, "name": "Kempegowda Bus Station (Majestic)", "lat": 12.9778, "lng": 77.5713, "dist_km": 0.0},
            {"seq": 2, "name": "Corporation Circle", "lat": 12.9720, "lng": 77.5890, "dist_km": 2.2},
            {"seq": 3, "name": "Lalbagh Main Gate", "lat": 12.9550, "lng": 77.5880, "dist_km": 4.1},
            {"seq": 4, "name": "Dairy Circle", "lat": 12.9390, "lng": 77.6010, "dist_km": 6.3},
            {"seq": 5, "name": "Jayadeva Hospital Flyover", "lat": 12.9220, "lng": 77.5980, "dist_km": 8.5},
            {"seq": 6, "name": "BTM Water Tank", "lat": 12.9166, "lng": 77.6101, "dist_km": 9.8},
            {"seq": 7, "name": "Arekere Mico Layout", "lat": 12.8940, "lng": 77.5990, "dist_km": 12.3},
            {"seq": 8, "name": "Hulimavu Gate", "lat": 12.8790, "lng": 77.5980, "dist_km": 14.1},
            {"seq": 9, "name": "Gottigere", "lat": 12.8590, "lng": 77.5930, "dist_km": 16.7},
            {"seq": 10, "name": "Bannerghatta National Park", "lat": 12.8020, "lng": 77.5760, "dist_km": 21.0},
        ]
    },
    "V-500C": {
        "route_number": "V-500C",
        "name": "Central Silk Board to Hebbal (Vajra AC)",
        "description": "Air-Conditioned Volvo Ring Road Service",
        "source": "Central Silk Board",
        "source_kannada": "ಸಿಲ್ಕ್ ಬೋರ್ಡ್",
        "destination": "Hebbal Flyover Bus Stop",
        "destination_kannada": "ಹೆಬ್ಬಾಳ",
        "service_type": "Vajra Volvo AC",
        "frequency": "Every 10 mins",
        "total_distance_km": 24.5,
        "estimated_duration_min": 60,
        "stops": [
            {"seq": 1, "name": "Central Silk Board", "lat": 12.9176, "lng": 77.6233, "dist_km": 0.0},
            {"seq": 2, "name": "HSR Layout BDA Complex", "lat": 12.9116, "lng": 77.6388, "dist_km": 1.8},
            {"seq": 3, "name": "Agara Junction", "lat": 12.9230, "lng": 77.6520, "dist_km": 3.2},
            {"seq": 4, "name": "Bellandur EcoSpace", "lat": 12.9304, "lng": 77.6784, "dist_km": 5.4},
            {"seq": 5, "name": "Devarabisanahalli", "lat": 12.9370, "lng": 77.6870, "dist_km": 6.8},
            {"seq": 6, "name": "Marathahalli Bridge", "lat": 12.9562, "lng": 77.7011, "dist_km": 9.2},
            {"seq": 7, "name": "Tin Factory (KR Puram)", "lat": 13.0035, "lng": 77.6744, "dist_km": 15.0},
            {"seq": 8, "name": "Kalyan Nagar Ring Road", "lat": 13.0232, "lng": 77.6431, "dist_km": 18.5},
            {"seq": 9, "name": "Nagavara Junction", "lat": 13.0352, "lng": 77.6250, "dist_km": 21.0},
            {"seq": 10, "name": "Hebbal Flyover Bus Stop", "lat": 13.0358, "lng": 77.5970, "dist_km": 24.5},
        ]
    }
}


def normalize_stop_query(text: str) -> str:
    import re
    if not text:
        return ""
    t = text.lower().strip()
    t = t.replace("sambhram", "sambram").replace("m.s.", "ms").replace("m s ", "ms ")
    t = re.sub(r'\b(bus\s+stop|bus\s+stand|bus\s+station|ttmc|junction|circle|gate|cross|stop|station)\b', '', t)
    t = re.sub(r'[\(\)\[\],.\-]', ' ', t)
    return " ".join(t.split())


def match_stop_by_query(query: str, user_lat: Optional[float] = None, user_lng: Optional[float] = None) -> Optional[Dict[str, Any]]:
    if not query or query.strip().lower() in ["current location", "my location", "here", "origin", "gps"]:
        if user_lat is not None and user_lng is not None:
            # Locate nearest catalog stop
            best_s = None
            best_d = 1e9
            for k, s in BMTC_STOPS_CATALOG.items():
                d = calculate_haversine_distance(user_lat, user_lng, s["latitude"], s["longitude"])
                if d < best_d:
                    best_d = d
                    best_s = s
            if best_s and best_d <= 3.5:
                return best_s
        return None

    raw_q = query.strip().lower()
    q = normalize_stop_query(query)

    # 1. Exact catalog key match
    if raw_q in BMTC_STOPS_CATALOG:
        return BMTC_STOPS_CATALOG[raw_q]

    # 2. Alias or normalized name match in catalog
    for stop_key, stop in BMTC_STOPS_CATALOG.items():
        s_norm = normalize_stop_query(stop["name"])
        if q == s_norm or raw_q == stop["name"].lower() or raw_q in stop.get("kannada_name", "").lower():
            return stop
        for alias in stop.get("aliases", []):
            a_norm = normalize_stop_query(alias)
            if a_norm and (a_norm == q or a_norm in q or q in a_norm):
                return stop

    # 3. Dynamic scan across all stops of all routes
    q_tokens = [tok for tok in q.split() if len(tok) >= 3]
    for r_id, r_info in BMTC_ROUTES_MASTER.items():
        for s in r_info.get("stops", []):
            s_name = s["name"]
            s_norm = normalize_stop_query(s_name)
            if q and (q == s_norm or q in s_norm or s_norm in q):
                return {
                    "stop_id": f"ST_DYN_{s.get('seq')}_{r_id}",
                    "name": s_name,
                    "latitude": s["lat"],
                    "longitude": s["lng"],
                    "aliases": [s_name.lower()],
                }
            if q_tokens and any(tok in s_norm for tok in q_tokens):
                return {
                    "stop_id": f"ST_DYN_{s.get('seq')}_{r_id}",
                    "name": s_name,
                    "latitude": s["lat"],
                    "longitude": s["lng"],
                    "aliases": [s_name.lower()],
                }

    # 4. Fallback coordinate distance if query is near GPS
    if user_lat is not None and user_lng is not None:
        for k, s in BMTC_STOPS_CATALOG.items():
            if calculate_haversine_distance(user_lat, user_lng, s["latitude"], s["longitude"]) <= 1.2:
                return s

    return None


def find_routes_between_stops(source_query: str, dest_query: str, user_lat: Optional[float] = None, user_lng: Optional[float] = None) -> List[Dict[str, Any]]:
    source_stop = match_stop_by_query(source_query, user_lat, user_lng)
    dest_stop = match_stop_by_query(dest_query)

    direct_routes = []

    s_clean = normalize_stop_query(source_query)
    d_clean = normalize_stop_query(dest_query)
    s_tokens = [tok for tok in s_clean.split() if len(tok) >= 3]
    d_tokens = [tok for tok in d_clean.split() if len(tok) >= 3]

    for route_id, route_info in BMTC_ROUTES_MASTER.items():
        stops = route_info["stops"]
        src_idx = -1
        dst_idx = -1

        for idx, s in enumerate(stops):
            s_name_lower = s["name"].lower()
            s_name_norm = normalize_stop_query(s["name"])

            # Check source match
            if src_idx == -1:
                if source_stop and calculate_haversine_distance(s["lat"], s["lng"], source_stop["latitude"], source_stop["longitude"]) < 1.8:
                    src_idx = idx
                elif user_lat is not None and user_lng is not None and ("my location" in source_query.lower() or "current" in source_query.lower()) and calculate_haversine_distance(s["lat"], s["lng"], user_lat, user_lng) < 2.0:
                    src_idx = idx
                elif s_clean and (s_clean in s_name_norm or s_name_norm in s_clean):
                    src_idx = idx
                elif s_tokens and any(tok in s_name_norm for tok in s_tokens):
                    src_idx = idx

            # Check dest match
            if dst_idx == -1:
                if dest_stop and calculate_haversine_distance(s["lat"], s["lng"], dest_stop["latitude"], dest_stop["longitude"]) < 1.8:
                    dst_idx = idx
                elif d_clean and (d_clean in s_name_norm or s_name_norm in d_clean):
                    dst_idx = idx
                elif d_tokens and any(tok in s_name_norm for tok in d_tokens):
                    dst_idx = idx

        if src_idx != -1 and dst_idx != -1 and src_idx != dst_idx:
            # Found a direct match!
            is_forward = src_idx < dst_idx
            start_stop = stops[src_idx]
            end_stop = stops[dst_idx]

            if is_forward:
                segment_stops = stops[src_idx:dst_idx + 1]
            else:
                segment_stops = list(reversed(stops[dst_idx:src_idx + 1]))

            stops_count = len(segment_stops)
            dist_km = abs(end_stop.get("dist_km", 0.0) - start_stop.get("dist_km", 0.0))
            if dist_km < 1.0:
                dist_km = calculate_haversine_distance(start_stop["lat"], start_stop["lng"], end_stop["lat"], end_stop["lng"])

            fare_info = estimate_bmtc_fare(dist_km)
            est_time_mins = max(10, int(round((dist_km / 22.0) * 60)))

            direct_routes.append({
                "route_number": route_id,
                "route_name": route_info["name"],
                "description": route_info["description"],
                "service_type": route_info["service_type"],
                "frequency": route_info["frequency"],
                "from_stop": start_stop["name"],
                "to_stop": end_stop["name"],
                "stops_count": stops_count,
                "stops_sequence": segment_stops,
                "distance_km": round(dist_km, 1),
                "estimated_time_mins": est_time_mins,
                "fare_ordinary_inr": fare_info["ordinary_fare_inr"],
                "fare_vajra_ac_inr": fare_info["vajra_ac_fare_inr"],
                "is_direct": True,
            })

    # If no direct route exists, provide intelligent 1-transfer route via Hub (Yeshwantpur, Majestic, Hebbal, or Silk Board)
    if not direct_routes:
        hubs = ["Yeshwantpur TTMC / Railway Station", "Kempegowda Bus Station (Majestic)", "Hebbal Flyover Bus Stop", "Central Silk Board"]
        for hub in hubs:
            leg1 = find_routes_between_stops(source_query, hub, user_lat, user_lng)
            leg2 = find_routes_between_stops(hub, dest_query)
            if leg1 and leg2:
                r1 = leg1[0]
                r2 = leg2[0]
                total_km = round(r1["distance_km"] + r2["distance_km"], 1)
                total_time = r1["estimated_time_mins"] + r2["estimated_time_mins"] + 10
                fare_info = estimate_bmtc_fare(total_km)
                direct_routes.append({
                    "route_number": f"{r1['route_number']} → {r2['route_number']}",
                    "route_name": f"{r1['route_number']} transfer at {hub} to {r2['route_number']}",
                    "description": f"Transfer at {hub}",
                    "service_type": "Connecting Service",
                    "frequency": "High Frequency",
                    "from_stop": r1["from_stop"],
                    "to_stop": r2["to_stop"],
                    "transfer_hub": hub,
                    "stops_count": r1["stops_count"] + r2["stops_count"],
                    "stops_sequence": r1["stops_sequence"] + r2["stops_sequence"][1:],
                    "distance_km": total_km,
                    "estimated_time_mins": total_time,
                    "fare_ordinary_inr": r1["fare_ordinary_inr"] + r2["fare_ordinary_inr"],
                    "fare_vajra_ac_inr": r1["fare_vajra_ac_inr"] + r2["fare_vajra_ac_inr"],
                    "is_direct": False,
                })
                break

    return direct_routes

