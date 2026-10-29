/**
 * Kenyan reference data used by the synthetic lakehouse generator.
 * 47 counties with approximate centroid coordinates, NTSA-style risk indices,
 * sub-counties, plus localised names / hospitals / vehicle fleet data.
 */

export type County = {
  code: string;
  name: string;
  region: string;
  capital: string;
  lat: number;
  lng: number;
  population: number;
  urbanRural: "Urban" | "Mixed" | "Rural";
  riskZone: "Red" | "Amber" | "Green";
  roadRisk: number;
  floodRisk: number;
  crimeRisk: number;
  rainfallMm: number;
  gdpIndex: number;
  mobilePenetration: number;
  /** tile-grid coordinates for the choropleth map */
  gx: number;
  gy: number;
  subCounties: string[];
};

export const COUNTIES: County[] = [
  { code: "001", name: "Mombasa", region: "Coast", capital: "Mombasa City", lat: -4.0435, lng: 39.6682, population: 1208333, urbanRural: "Urban", riskZone: "Red", roadRisk: 0.82, floodRisk: 0.55, crimeRisk: 0.71, rainfallMm: 1040, gdpIndex: 0.86, mobilePenetration: 0.94, gx: 6, gy: 9, subCounties: ["Mvita", "Nyali", "Likoni", "Changamwe", "Kisauni"] },
  { code: "002", name: "Kwale", region: "Coast", capital: "Kwale", lat: -4.1737, lng: 39.4521, population: 866820, urbanRural: "Rural", riskZone: "Amber", roadRisk: 0.58, floodRisk: 0.42, crimeRisk: 0.44, rainfallMm: 900, gdpIndex: 0.31, mobilePenetration: 0.71, gx: 5, gy: 9, subCounties: ["Msambweni", "Lunga Lunga", "Matuga", "Kinango"] },
  { code: "003", name: "Kilifi", region: "Coast", capital: "Kilifi", lat: -3.6304, lng: 39.8499, population: 1453787, urbanRural: "Mixed", riskZone: "Amber", roadRisk: 0.66, floodRisk: 0.48, crimeRisk: 0.52, rainfallMm: 850, gdpIndex: 0.38, mobilePenetration: 0.78, gx: 7, gy: 8, subCounties: ["Kilifi North", "Kilifi South", "Malindi", "Ganze", "Magarini"] },
  { code: "004", name: "Tana River", region: "Coast", capital: "Hola", lat: -1.7500, lng: 40.0667, population: 315943, urbanRural: "Rural", riskZone: "Green", roadRisk: 0.44, floodRisk: 0.88, crimeRisk: 0.36, rainfallMm: 550, gdpIndex: 0.18, mobilePenetration: 0.52, gx: 8, gy: 7, subCounties: ["Galole", "Garsen", "Bura"] },
  { code: "005", name: "Lamu", region: "Coast", capital: "Lamu", lat: -2.2355, lng: 40.9016, population: 143920, urbanRural: "Rural", riskZone: "Amber", roadRisk: 0.41, floodRisk: 0.51, crimeRisk: 0.58, rainfallMm: 600, gdpIndex: 0.24, mobilePenetration: 0.61, gx: 8, gy: 6, subCounties: ["Lamu East", "Lamu West"] },
  { code: "006", name: "Taita Taveta", region: "Coast", capital: "Voi", lat: -3.3936, lng: 38.5639, population: 340671, urbanRural: "Rural", riskZone: "Green", roadRisk: 0.52, floodRisk: 0.34, crimeRisk: 0.38, rainfallMm: 500, gdpIndex: 0.27, mobilePenetration: 0.66, gx: 6, gy: 8, subCounties: ["Voi", "Taveta", "Mwatate", "Voi"] },
  { code: "007", name: "Garissa", region: "North Eastern", capital: "Garissa", lat: -0.4569, lng: 39.6583, population: 841353, urbanRural: "Rural", riskZone: "Amber", roadRisk: 0.49, floodRisk: 0.72, crimeRisk: 0.61, rainfallMm: 300, gdpIndex: 0.16, mobilePenetration: 0.58, gx: 9, gy: 5, subCounties: ["Garissa Township", "Balambala", "Lagdera", "Dadaab"] },
  { code: "008", name: "Wajir", region: "North Eastern", capital: "Wajir", lat: 1.7471, lng: 40.0573, population: 781263, urbanRural: "Rural", riskZone: "Green", roadRisk: 0.42, floodRisk: 0.45, crimeRisk: 0.47, rainfallMm: 250, gdpIndex: 0.13, mobilePenetration: 0.55, gx: 9, gy: 3, subCounties: ["Wajir North", "Wajir South", "Tarbaj", "Habaswein"] },
  { code: "009", name: "Mandera", region: "North Eastern", capital: "Mandera", lat: 3.9344, lng: 41.8591, population: 1025756, urbanRural: "Rural", riskZone: "Amber", roadRisk: 0.46, floodRisk: 0.41, crimeRisk: 0.66, rainfallMm: 240, gdpIndex: 0.12, mobilePenetration: 0.49, gx: 9, gy: 1, subCounties: ["Mandera East", "Mandera West", "Banissa", "Elwak"] },
  { code: "010", name: "Marsabit", region: "Northern", capital: "Marsabit", lat: 2.3333, lng: 37.9833, population: 459785, urbanRural: "Rural", riskZone: "Green", roadRisk: 0.39, floodRisk: 0.38, crimeRisk: 0.52, rainfallMm: 300, gdpIndex: 0.14, mobilePenetration: 0.47, gx: 6, gy: 1, subCounties: ["Marsabit Central", "Laisamis", "North Horr"] },
  { code: "011", name: "Isiolo", region: "Northern", capital: "Isiolo", lat: 0.3524, lng: 37.5816, population: 268002, urbanRural: "Rural", riskZone: "Green", roadRisk: 0.41, floodRisk: 0.35, crimeRisk: 0.49, rainfallMm: 320, gdpIndex: 0.17, mobilePenetration: 0.53, gx: 6, gy: 3, subCounties: ["Isiolo", "Garbatulla", "Merti"] },
  { code: "012", name: "Meru", region: "Eastern", capital: "Meru", lat: 0.0500, lng: 37.6500, population: 1545714, urbanRural: "Mixed", riskZone: "Green", roadRisk: 0.48, floodRisk: 0.31, crimeRisk: 0.37, rainfallMm: 1200, gdpIndex: 0.42, mobilePenetration: 0.79, gx: 8, gy: 3, subCounties: ["Imenti South", "Imenti North", "Buuri", "Tigania West"] },
  { code: "013", name: "Tharaka-Nithi", region: "Eastern", capital: "Chuka", lat: -0.3000, lng: 37.6500, population: 393177, urbanRural: "Rural", riskZone: "Green", roadRisk: 0.45, floodRisk: 0.29, crimeRisk: 0.33, rainfallMm: 1100, gdpIndex: 0.26, mobilePenetration: 0.72, gx: 8, gy: 4, subCounties: ["Tharaka South", "Chuka Igambang'ombe"] },
  { code: "014", name: "Embu", region: "Eastern", capital: "Embu", lat: -0.5333, lng: 37.4500, population: 608599, urbanRural: "Mixed", riskZone: "Green", roadRisk: 0.47, floodRisk: 0.3, crimeRisk: 0.35, rainfallMm: 1150, gdpIndex: 0.3, mobilePenetration: 0.75, gx: 7, gy: 4, subCounties: ["Manyatta", "Runyenjes", "Mbeere South"] },
  { code: "015", name: "Kitui", region: "Eastern", capital: "Kitui", lat: -1.3667, lng: 38.0167, population: 1136187, urbanRural: "Rural", riskZone: "Amber", roadRisk: 0.53, floodRisk: 0.62, crimeRisk: 0.41, rainfallMm: 700, gdpIndex: 0.22, mobilePenetration: 0.68, gx: 8, gy: 5, subCounties: ["Kitui Central", "Mwingi North", "Mutomo", "Ikutha"] },
  { code: "016", name: "Machakos", region: "Eastern", capital: "Machakos", lat: -1.5167, lng: 37.2667, population: 1421932, urbanRural: "Mixed", riskZone: "Amber", roadRisk: 0.63, floodRisk: 0.44, crimeRisk: 0.51, rainfallMm: 800, gdpIndex: 0.45, mobilePenetration: 0.83, gx: 7, gy: 6, subCounties: ["Machakos Town", "Mavoko", "Kangundo", "Athi River"] },
  { code: "017", name: "Makueni", region: "Eastern", capital: "Wote", lat: -1.8333, lng: 37.6167, population: 987653, urbanRural: "Rural", riskZone: "Amber", roadRisk: 0.56, floodRisk: 0.47, crimeRisk: 0.39, rainfallMm: 650, gdpIndex: 0.25, mobilePenetration: 0.7, gx: 7, gy: 7, subCounties: ["Makueni", "Kibwezi", "Mbooni", "Narok"] },
  { code: "018", name: "Nyandarua", region: "Central", capital: "Ol Kalou", lat: -0.4500, lng: 36.4333, population: 638289, urbanRural: "Rural", riskZone: "Green", roadRisk: 0.44, floodRisk: 0.28, crimeRisk: 0.31, rainfallMm: 1250, gdpIndex: 0.28, mobilePenetration: 0.74, gx: 5, gy: 5, subCounties: ["Ol Kalou", "Kinangop", "Mirangine"] },
  { code: "019", name: "Nyeri", region: "Central", capital: "Nyeri", lat: -0.4201, lng: 36.9476, population: 759164, urbanRural: "Mixed", riskZone: "Green", roadRisk: 0.49, floodRisk: 0.27, crimeRisk: 0.34, rainfallMm: 1200, gdpIndex: 0.4, mobilePenetration: 0.8, gx: 6, gy: 4, subCounties: ["Nyeri Central", "Kieni East", "Othaya", "Mukurwe-ini"] },
  { code: "020", name: "Kirinyaga", region: "Central", capital: "Kerugoya", lat: -0.5000, lng: 37.2833, population: 610411, urbanRural: "Rural", riskZone: "Green", roadRisk: 0.46, floodRisk: 0.33, crimeRisk: 0.3, rainfallMm: 1300, gdpIndex: 0.29, mobilePenetration: 0.76, gx: 7, gy: 5, subCounties: ["Kirinyaga Central", "Mwea", "Gichugu"] },
  { code: "021", name: "Murang'a", region: "Central", capital: "Murang'a", lat: -0.7833, lng: 37.0500, population: 1056640, urbanRural: "Rural", riskZone: "Green", roadRisk: 0.5, floodRisk: 0.32, crimeRisk: 0.33, rainfallMm: 1250, gdpIndex: 0.32, mobilePenetration: 0.77, gx: 6, gy: 5, subCounties: ["Kangema", "Mathioya", "Kahuro", "Kigumo"] },
  { code: "022", name: "Kiambu", region: "Central", capital: "Kiambu", lat: -1.1667, lng: 36.8333, population: 2478530, urbanRural: "Urban", riskZone: "Amber", roadRisk: 0.74, floodRisk: 0.36, crimeRisk: 0.6, rainfallMm: 1000, gdpIndex: 0.78, mobilePenetration: 0.92, gx: 7, gy: 6, subCounties: ["Thika Town", "Ruiru", "Kikuyu", "Limuru", "Kiambu Town"] },
  { code: "023", name: "Turkana", region: "Northern", capital: "Lodwar", lat: 3.1167, lng: 35.6, population: 926976, urbanRural: "Rural", riskZone: "Green", roadRisk: 0.37, floodRisk: 0.42, crimeRisk: 0.55, rainfallMm: 200, gdpIndex: 0.1, mobilePenetration: 0.4, gx: 3, gy: 1, subCounties: ["Turkana Central", "Turkana South", "Loima", "Kibish"] },
  { code: "024", name: "West Pokot", region: "Rift Valley", capital: "Kapenguria", lat: 1.2500, lng: 35.1167, population: 621241, urbanRural: "Rural", riskZone: "Amber", roadRisk: 0.44, floodRisk: 0.5, crimeRisk: 0.62, rainfallMm: 700, gdpIndex: 0.15, mobilePenetration: 0.5, gx: 3, gy: 2, subCounties: ["Kapenguria", "Sigor", "Kacheliba"] },
  { code: "025", name: "Samburu", region: "Northern", capital: "Maralal", lat: 1.1, lng: 36.7, population: 310757, urbanRural: "Rural", riskZone: "Green", roadRisk: 0.4, floodRisk: 0.36, crimeRisk: 0.5, rainfallMm: 350, gdpIndex: 0.13, mobilePenetration: 0.48, gx: 5, gy: 2, subCounties: ["Samburu East", "Samburu North", "Wamba"] },
  { code: "026", name: "Trans Nzoia", region: "Rift Valley", capital: "Kitale", lat: 1.0167, lng: 35.0, population: 990341, urbanRural: "Mixed", riskZone: "Green", roadRisk: 0.5, floodRisk: 0.38, crimeRisk: 0.42, rainfallMm: 1200, gdpIndex: 0.34, mobilePenetration: 0.76, gx: 3, gy: 3, subCounties: ["Trans Nzoia West", "Endebess", "Kiminini"] },
  { code: "027", name: "Uasin Gishu", region: "Rift Valley", capital: "Eldoret", lat: 0.5167, lng: 35.2667, population: 1163186, urbanRural: "Urban", riskZone: "Amber", roadRisk: 0.71, floodRisk: 0.34, crimeRisk: 0.56, rainfallMm: 1100, gdpIndex: 0.62, mobilePenetration: 0.87, gx: 3, gy: 4, subCounties: ["Eldoret North", "Eldoret South", "Ainabkoi", "Turbo"] },
  { code: "028", name: "Elgeyo Marakwet", region: "Rift Valley", capital: "Iten", lat: 0.75, lng: 35.4333, population: 454480, urbanRural: "Rural", riskZone: "Green", roadRisk: 0.47, floodRisk: 0.3, crimeRisk: 0.36, rainfallMm: 1150, gdpIndex: 0.21, mobilePenetration: 0.7, gx: 4, gy: 3, subCounties: ["Keiyo North", "Marakwet East", "Soy"] },
  { code: "029", name: "Nandi", region: "Rift Valley", capital: "Kapsabet", lat: 0.2, lng: 35.1, population: 885711, urbanRural: "Rural", riskZone: "Green", roadRisk: 0.49, floodRisk: 0.31, crimeRisk: 0.38, rainfallMm: 1400, gdpIndex: 0.24, mobilePenetration: 0.73, gx: 2, gy: 4, subCounties: ["Kapsabet", "Tinderet", "Nandi Hills"] },
  { code: "030", name: "Baringo", region: "Rift Valley", capital: "Kabarnet", lat: 0.4833, lng: 35.7333, population: 666763, urbanRural: "Rural", riskZone: "Amber", roadRisk: 0.45, floodRisk: 0.57, crimeRisk: 0.58, rainfallMm: 600, gdpIndex: 0.16, mobilePenetration: 0.55, gx: 5, gy: 3, subCounties: ["Baringo Central", "Marigat", "Mogotio"] },
  { code: "031", name: "Laikipia", region: "Rift Valley", capital: "Rumuruti", lat: 0.0333, lng: 36.6667, population: 518560, urbanRural: "Mixed", riskZone: "Green", roadRisk: 0.5, floodRisk: 0.33, crimeRisk: 0.44, rainfallMm: 700, gdpIndex: 0.31, mobilePenetration: 0.74, gx: 6, gy: 3, subCounties: ["Laikipia West", "Nyahururu", "Nanyuki"] },
  { code: "032", name: "Nakuru", region: "Rift Valley", capital: "Nakuru", lat: -0.3031, lng: 36.08, population: 2162202, urbanRural: "Urban", riskZone: "Red", roadRisk: 0.79, floodRisk: 0.41, crimeRisk: 0.64, rainfallMm: 950, gdpIndex: 0.71, mobilePenetration: 0.89, gx: 5, gy: 4, subCounties: ["Nakuru East", "Nakuru West", "Naivasha", "Gilgil", "Njoro"] },
  { code: "033", name: "Narok", region: "Rift Valley", capital: "Narok", lat: -1.0833, lng: 35.8667, population: 1157873, urbanRural: "Rural", riskZone: "Amber", roadRisk: 0.62, floodRisk: 0.44, crimeRisk: 0.47, rainfallMm: 900, gdpIndex: 0.28, mobilePenetration: 0.66, gx: 4, gy: 6, subCounties: ["Narok North", "Narok South", "Transmara", "Kilgoris"] },
  { code: "034", name: "Kajiado", region: "Rift Valley", capital: "Kajiado", lat: -1.85, lng: 36.7833, population: 1117840, urbanRural: "Mixed", riskZone: "Amber", roadRisk: 0.68, floodRisk: 0.39, crimeRisk: 0.57, rainfallMm: 550, gdpIndex: 0.5, mobilePenetration: 0.84, gx: 5, gy: 6, subCounties: ["Kajiado Central", "Ngong", "Isinya", "Loitokitok"] },
  { code: "035", name: "Kericho", region: "Rift Valley", capital: "Kericho", lat: -0.3667, lng: 35.2833, population: 901777, urbanRural: "Rural", riskZone: "Green", roadRisk: 0.55, floodRisk: 0.3, crimeRisk: 0.34, rainfallMm: 1600, gdpIndex: 0.3, mobilePenetration: 0.75, gx: 3, gy: 5, subCounties: ["Kericho Town", "Belgut", "Bureti"] },
  { code: "036", name: "Bomet", region: "Rift Valley", capital: "Bomet", lat: -0.7833, lng: 35.35, population: 875689, urbanRural: "Rural", riskZone: "Green", roadRisk: 0.52, floodRisk: 0.31, crimeRisk: 0.32, rainfallMm: 1500, gdpIndex: 0.24, mobilePenetration: 0.72, gx: 3, gy: 6, subCounties: ["Bomet Central", "Sotik", "Konoin"] },
  { code: "037", name: "Kakamega", region: "Western", capital: "Kakamega", lat: 0.2833, lng: 34.75, population: 1867579, urbanRural: "Rural", riskZone: "Amber", roadRisk: 0.61, floodRisk: 0.46, crimeRisk: 0.5, rainfallMm: 1500, gdpIndex: 0.31, mobilePenetration: 0.76, gx: 1, gy: 3, subCounties: ["Kakamega Central", "Mumias", "Malava", "Navakholo"] },
  { code: "038", name: "Vihiga", region: "Western", capital: "Vihiga", lat: 0.05, lng: 34.7167, population: 590668, urbanRural: "Rural", riskZone: "Green", roadRisk: 0.53, floodRisk: 0.4, crimeRisk: 0.41, rainfallMm: 1700, gdpIndex: 0.2, mobilePenetration: 0.74, gx: 1, gy: 4, subCounties: ["Vihiga", "Sabatia", "Emuhaya"] },
  { code: "039", name: "Bungoma", region: "Western", capital: "Bungoma", lat: 0.5667, lng: 34.55, population: 1670570, urbanRural: "Rural", riskZone: "Green", roadRisk: 0.56, floodRisk: 0.43, crimeRisk: 0.44, rainfallMm: 1400, gdpIndex: 0.27, mobilePenetration: 0.74, gx: 1, gy: 2, subCounties: ["Bungoma East", "Webuye", "Mt Elgon", "Kimilili"] },
  { code: "040", name: "Busia", region: "Western", capital: "Busia", lat: 0.4667, lng: 34.1167, population: 743946, urbanRural: "Rural", riskZone: "Green", roadRisk: 0.54, floodRisk: 0.58, crimeRisk: 0.46, rainfallMm: 1300, gdpIndex: 0.19, mobilePenetration: 0.7, gx: 0, gy: 4, subCounties: ["Busia Township", "Matayos", "Nambale"] },
  { code: "041", name: "Siaya", region: "Nyanza", capital: "Siaya", lat: 0.0667, lng: 34.2833, population: 993165, urbanRural: "Rural", riskZone: "Green", roadRisk: 0.52, floodRisk: 0.55, crimeRisk: 0.4, rainfallMm: 1300, gdpIndex: 0.21, mobilePenetration: 0.72, gx: 0, gy: 5, subCounties: ["Siaya Township", "Gem", "Ugunja"] },
  { code: "042", name: "Kisumu", region: "Nyanza", capital: "Kisumu", lat: -0.0917, lng: 34.768, population: 1155574, urbanRural: "Urban", riskZone: "Red", roadRisk: 0.76, floodRisk: 0.66, crimeRisk: 0.62, rainfallMm: 1250, gdpIndex: 0.58, mobilePenetration: 0.88, gx: 1, gy: 5, subCounties: ["Kisumu Central", "Kisumu West", "Seme", "Nyando"] },
  { code: "043", name: "Homa Bay", region: "Nyanza", capital: "Homa Bay", lat: -0.5167, lng: 34.45, population: 1131950, urbanRural: "Rural", riskZone: "Green", roadRisk: 0.51, floodRisk: 0.6, crimeRisk: 0.39, rainfallMm: 1200, gdpIndex: 0.19, mobilePenetration: 0.71, gx: 0, gy: 6, subCounties: ["Homa Bay Town", "Rachuonyo", "Mbita"] },
  { code: "044", name: "Migori", region: "Nyanza", capital: "Migori", lat: -1.0667, lng: 34.4667, population: 1116436, urbanRural: "Rural", riskZone: "Amber", roadRisk: 0.58, floodRisk: 0.5, crimeRisk: 0.48, rainfallMm: 1250, gdpIndex: 0.22, mobilePenetration: 0.71, gx: 0, gy: 7, subCounties: ["Migori Town", "Rongo", "Awendo", "Kuria"] },
  { code: "045", name: "Kisii", region: "Nyanza", capital: "Kisii", lat: -0.6833, lng: 34.7667, population: 1266860, urbanRural: "Rural", riskZone: "Green", roadRisk: 0.57, floodRisk: 0.37, crimeRisk: 0.37, rainfallMm: 1500, gdpIndex: 0.26, mobilePenetration: 0.75, gx: 1, gy: 6, subCounties: ["Kisii Town", "Nyamache", "Masaba"] },
  { code: "046", name: "Nyamira", region: "Nyanza", capital: "Nyamira", lat: -0.5667, lng: 34.9333, population: 605576, urbanRural: "Rural", riskZone: "Green", roadRisk: 0.53, floodRisk: 0.35, crimeRisk: 0.33, rainfallMm: 1600, gdpIndex: 0.18, mobilePenetration: 0.72, gx: 1, gy: 7, subCounties: ["Nyamira North", "Borabu", "Manga"] },
  { code: "047", name: "Nairobi", region: "Nairobi", capital: "Nairobi City", lat: -1.2864, lng: 36.8172, population: 4397073, urbanRural: "Urban", riskZone: "Red", roadRisk: 0.91, floodRisk: 0.49, crimeRisk: 0.83, rainfallMm: 900, gdpIndex: 1.0, mobilePenetration: 0.97, gx: 6, gy: 6, subCounties: ["Westlands", "Starehe", "Kamukunji", "Langata", "Kasarani", "Dagoretti"] },
];

export const COUNTY_BY_CODE = new Map(COUNTIES.map((c) => [c.code, c]));

export const LOBS = [
  { key: "Motor", product: "Motor Comprehensive", weight: 0.42, basePremium: 62000, severity: 1.0, devSpeed: 0.9 },
  { key: "Health", product: "Health (Inpatient/Outpatient)", weight: 0.26, basePremium: 48000, severity: 0.62, devSpeed: 1.5 },
  { key: "Life", product: "Life & Personal Accident", weight: 0.12, basePremium: 35000, severity: 1.35, devSpeed: 0.45 },
  { key: "Micro", product: "Microinsurance (KSh 500/mo)", weight: 0.14, basePremium: 6000, severity: 0.18, devSpeed: 2.2 },
  { key: "Agriculture", product: "Agriculture & Livestock", weight: 0.06, basePremium: 18000, severity: 0.75, devSpeed: 0.7 },
];

export const CAUSES: Record<string, string[]> = {
  Motor: ["Third-party collision", "Own damage - accident", "Theft of vehicle", "Carjacking", "Fire damage", "Windscreen", "Passenger liability", "Hit and run"],
  Health: ["Malaria treatment", "Maternity delivery", "Road traffic injury", "Chronic disease management", "Surgery - elective", "Oncology", "Renal dialysis", "Emergency admission"],
  Life: ["Natural death", "Critical illness", "Disability - permanent", "Funeral benefit", "Accidental death"],
  Micro: ["Funeral cover claim", "Livestock mortality", "Crop failure (drought)", "School fees benefit", "Flood damage"],
  Agriculture: ["Drought index payout", "Livestock mortality", "Crop disease", "Hail damage", "Flood index payout"],
};

export const FIRST_NAMES = ["Wanjiku", "Otieno", "Achieng", "Kamau", "Mwangi", "Njeri", "Odhiambo", "Kipchoge", "Wekesa", "Mutiso", "Akinyi", "Njoroge", "Hassan", "Amina", "Chebet", "Kiptoo", "Nyambura", "Barasa", "Onyango", "Wambui", "Kimani", "Abdi", "Fatuma", "Juma", "Karanja", "Mercy", "Peter", "Grace", "Samuel", "Lucy", "Brian", "Zainab", "Dennis", "Esther", "Moses", "Joseph", "Sarah", "Daniel", "Faith", "Victor"];
export const LAST_NAMES = ["Mwangi", "Otieno", "Kamau", "Wanjala", "Cheruiyot", "Kimani", "Omondi", "Njoroge", "Hassan", "Kiplagat", "Waweru", "Mutua", "Achieng", "Ndung'u", "Kariuki", "Owino", "Barasa", "Chege", "Abdi", "Musyoka", "Nyongesa", "Koech", "Gichuru", "Macharia", "Rotich"];

export const HOSPITAL_PREFIX = ["Nairobi", "Kenyatta", "Aga Khan", "MP Shah", "Mater", "St Mary's", "Coast General", "Kisumu", "Nakuru Level 5", "Eldoret Teaching", "Meru", "Thika Level 5", "Machakos", "Kakamega", "Bungoma", "Mombasa", "Gertrude's", "Coptic", "Pandya", "Avenue"];
export const HOSPITAL_SUFFIX = ["Hospital", "Medical Centre", "Clinic", "Nursing Home", "Health Centre", "Specialist Centre"];

export const GARAGE_PREFIX = ["AutoCare", "Motorhub", "Kenol", "Silverstar", "Pan Africa", "Motortrade", "Rift Valley", "Lake Basin", "Coastal", "Highland"];
export const GARAGE_SUFFIX = ["Garage Ltd", "Bodyshop", "Motor Engineers", "Autobody", "Assessors & Repairers"];

export const VEHICLE_MAKES: Record<string, { models: string[]; weight: number }> = {
  Toyota: { weight: 0.38, models: ["Probox", "Fielder", "Hiace", "Land Cruiser Prado", "Vitz", "Axio", "Harrier", "Isis", "Succeed", "Fortuner"] },
  Nissan: { weight: 0.14, models: ["Note", "X-Trail", "Navara", "Wingroad", "AD Van", "Sunny"] },
  Subaru: { weight: 0.08, models: ["Impreza", "Forester", "Legacy", "Outback"] },
  Mazda: { weight: 0.07, models: ["Demio", "CX-5", "Axela", "Proceed"] },
  Mitsubishi: { weight: 0.06, models: ["Lancer", "Pajero", "Canter", "L200"] },
  Isuzu: { weight: 0.12, models: ["NPR", "NQR", "D-Max", "Elf"] },
  Honda: { weight: 0.05, models: ["Fit", "CR-V", "Airwave"] },
  Volkswagen: { weight: 0.05, models: ["Polo", "Golf", "Amarok"] },
  "Mercedes-Benz": { weight: 0.03, models: ["C200", "E250", "Actros"] },
  Boda: { weight: 0.02, models: ["Boxer 100", "TVS Apache", "Haojin HJ150"] },
};

export const BODY_TYPES = ["Saloon", "Hatchback", "SUV", "Pickup", "Van", "Truck", "Bus", "Motorcycle"];
export const USAGES = ["Private", "Commercial (PSV Matatu)", "Goods carriage", "Ride-hailing (Uber/Bolt)", "Agricultural", "Government", "School transport"];
export const OCCUPATIONS = ["Trader", "Teacher", "Farmer", "Software Engineer", "Nurse", "Matatu Driver", "Boda Boda Rider", "Accountant", "Civil Servant", "Doctor", "Mechanic", "Sales Rep", "Banker", "Security Officer", "Pharmacist", "Lawyer", "Unemployed", "Student", "Business Owner", "Clerk"];
export const INCOME_BANDS = ["< KSh 20k", "KSh 20k - 50k", "KSh 50k - 100k", "KSh 100k - 250k", "KSh 250k - 500k", "> KSh 500k"];
export const CHANNELS = ["Direct Digital", "Agent/Broker", "Bancassurance", "M-PESA Super App", "Sacco", "Telesales", "Mobile money agent"];
export const PAYMENT_CHANNELS = ["M-PESA", "M-PESA Global", "Bank Transfer", "Card (Visa/Mastercard)", "Cash at Branch", "Agency Banking", "Sacco", "Airtel Money"];
export const INTERACTION_TYPES = ["Call centre inbound", "USSD *310#", "WhatsApp bot", "Branch visit", "Email", "Renewal reminder", "Claim follow-up", "Complaint", "Cross-sell offer", "App login"];
export const BROKER_FIRMS = ["Minet Kenya", "Aon Kenya", "Cytonn Insurance Brokers", "Britam Agency", "Marsh McLennan EA", "Pacis Brokers", "Heritage EA", "Sanlam Alliance"];

export const KAFKA_TOPICS = [
  { topic: "insurance.claims", partitions: 12, source: "Policy Admin (Java/Kafka Connect)", retention: "7 days", schema: "avro v3" },
  { topic: "insurance.payments", partitions: 8, source: "M-PESA Daraja API / Payments Core", retention: "7 days", schema: "avro v2" },
  { topic: "insurance.policies", partitions: 6, source: "Core Insurance (SAP FS) CDC", retention: "7 days", schema: "avro v3" },
  { topic: "insurance.telematics", partitions: 24, source: "IoT Gateway (MQTT → Kafka)", retention: "48 hours", schema: "protobuf v4" },
  { topic: "insurance.mpesa", partitions: 8, source: "Daraja STK callback stream", retention: "7 days", schema: "json v2" },
  { topic: "insurance.fraud_alerts", partitions: 4, source: "Fraud Feature Engine (Spark)", retention: "30 days", schema: "avro v1" },
  { topic: "insurance.customers", partitions: 6, source: "CRM + CDC (Debezium)", retention: "7 days", schema: "avro v2" },
  { topic: "insurance.interactions", partitions: 6, source: "Contact Centre / WhatsApp Business", retention: "3 days", schema: "json v1" },
];

export const DBT_MODELS = [
  { name: "stg_claims", layer: "silver", dependsOn: ["bronze.claims"], tests: 6 },
  { name: "silver_claim", layer: "silver", dependsOn: ["stg_claims", "silver_policy"], tests: 9 },
  { name: "silver_policy", layer: "silver", dependsOn: ["stg_policies"], tests: 7 },
  { name: "fact_claims", layer: "gold", dependsOn: ["silver_claim", "dim_date", "dim_location", "dim_policy"], tests: 12 },
  { name: "fact_premiums", layer: "gold", dependsOn: ["silver_policy", "dim_agent", "dim_date"], tests: 8 },
  { name: "fact_fraud_events", layer: "gold", dependsOn: ["silver_claim", "ml_fraud_features"], tests: 5 },
];
