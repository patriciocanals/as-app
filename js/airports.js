// Catálogo base de aeropuertos: IATA | ciudad (es) | país ISO-2 | nombre aeropuerto
// Si falta alguno, se puede añadir como "aeropuerto personalizado" desde el panel de administración.
const RAW = `
MAD|Madrid|ES|Adolfo Suárez Madrid-Barajas
BCN|Barcelona|ES|Josep Tarradellas Barcelona-El Prat
AGP|Málaga|ES|Málaga-Costa del Sol
PMI|Palma de Mallorca|ES|Son Sant Joan
VLC|Valencia|ES|Valencia
SVQ|Sevilla|ES|San Pablo
BIO|Bilbao|ES|Bilbao
TFN|Tenerife|ES|Tenerife Norte
LPA|Gran Canaria|ES|Gran Canaria
LIS|Lisboa|PT|Humberto Delgado
OPO|Oporto|PT|Francisco Sá Carneiro
LHR|Londres|GB|Heathrow
LGW|Londres|GB|Gatwick
MAN|Mánchester|GB|Manchester
EDI|Edimburgo|GB|Edimburgo
DUB|Dublín|IE|Dublín
CDG|París|FR|Charles de Gaulle
ORY|París|FR|Orly
NCE|Niza|FR|Costa Azul
LYS|Lyon|FR|Saint-Exupéry
FRA|Fráncfort|DE|Fráncfort
MUC|Múnich|DE|Múnich
BER|Berlín|DE|Brandeburgo
HAM|Hamburgo|DE|Hamburgo
AMS|Ámsterdam|NL|Schiphol
BRU|Bruselas|BE|Bruselas
ZRH|Zúrich|CH|Zúrich
GVA|Ginebra|CH|Ginebra
VIE|Viena|AT|Viena-Schwechat
FCO|Roma|IT|Fiumicino
MXP|Milán|IT|Malpensa
VCE|Venecia|IT|Marco Polo
NAP|Nápoles|IT|Capodichino
ATH|Atenas|GR|Eleftherios Venizelos
IST|Estambul|TR|Estambul
CPH|Copenhague|DK|Kastrup
ARN|Estocolmo|SE|Arlanda
OSL|Oslo|NO|Gardermoen
HEL|Helsinki|FI|Helsinki-Vantaa
KEF|Reikiavik|IS|Keflavík
WAW|Varsovia|PL|Chopin
PRG|Praga|CZ|Václav Havel
BUD|Budapest|HU|Ferenc Liszt
OTP|Bucarest|RO|Henri Coandă
SVO|Moscú|RU|Sheremétievo
DXB|Dubái|AE|Dubái
AUH|Abu Dabi|AE|Zayed
DOH|Doha|QA|Hamad
RUH|Riad|SA|Rey Khalid
TLV|Tel Aviv|IL|Ben Gurión
CAI|El Cairo|EG|El Cairo
CMN|Casablanca|MA|Mohammed V
RAK|Marrakech|MA|Menara
ALG|Argel|DZ|Houari Boumediene
TUN|Túnez|TN|Túnez-Cartago
LOS|Lagos|NG|Murtala Muhammed
ACC|Acra|GH|Kotoka
DKR|Dakar|SN|Blaise Diagne
ADD|Adís Abeba|ET|Bole
NBO|Nairobi|KE|Jomo Kenyatta
JNB|Johannesburgo|ZA|O. R. Tambo
CPT|Ciudad del Cabo|ZA|Ciudad del Cabo
JFK|Nueva York|US|John F. Kennedy
EWR|Nueva York|US|Newark Liberty
LAX|Los Ángeles|US|Los Ángeles
SFO|San Francisco|US|San Francisco
ORD|Chicago|US|O'Hare
MIA|Miami|US|Miami
ATL|Atlanta|US|Hartsfield-Jackson
DFW|Dallas|US|Dallas/Fort Worth
IAD|Washington|US|Dulles
BOS|Boston|US|Logan
SEA|Seattle|US|Seattle-Tacoma
LAS|Las Vegas|US|Harry Reid
MCO|Orlando|US|Orlando
YYZ|Toronto|CA|Pearson
YUL|Montreal|CA|Trudeau
YVR|Vancouver|CA|Vancouver
MEX|Ciudad de México|MX|Benito Juárez
CUN|Cancún|MX|Cancún
GDL|Guadalajara|MX|Miguel Hidalgo
HAV|La Habana|CU|José Martí
PUJ|Punta Cana|DO|Punta Cana
SJU|San Juan|PR|Luis Muñoz Marín
PTY|Ciudad de Panamá|PA|Tocumen
SJO|San José|CR|Juan Santamaría
BOG|Bogotá|CO|El Dorado
MDE|Medellín|CO|José María Córdova
CTG|Cartagena|CO|Rafael Núñez
UIO|Quito|EC|Mariscal Sucre
LIM|Lima|PE|Jorge Chávez
CUZ|Cuzco|PE|Alejandro Velasco Astete
SCL|Santiago de Chile|CL|Arturo Merino Benítez
EZE|Buenos Aires|AR|Ministro Pistarini (Ezeiza)
AEP|Buenos Aires|AR|Aeroparque Jorge Newbery
COR|Córdoba|AR|Ingeniero Taravella
MDZ|Mendoza|AR|El Plumerillo
USH|Ushuaia|AR|Malvinas Argentinas
MVD|Montevideo|UY|Carrasco
ASU|Asunción|PY|Silvio Pettirossi
LPB|La Paz|BO|El Alto
VVI|Santa Cruz de la Sierra|BO|Viru Viru
GRU|São Paulo|BR|Guarulhos
GIG|Río de Janeiro|BR|Galeão
BSB|Brasilia|BR|Brasilia
CCS|Caracas|VE|Simón Bolívar
DEL|Nueva Delhi|IN|Indira Gandhi
BOM|Bombay|IN|Chhatrapati Shivaji
BKK|Bangkok|TH|Suvarnabhumi
SIN|Singapur|SG|Changi
KUL|Kuala Lumpur|MY|Kuala Lumpur
CGK|Yakarta|ID|Soekarno-Hatta
DPS|Bali|ID|Ngurah Rai
MNL|Manila|PH|Ninoy Aquino
HKG|Hong Kong|HK|Hong Kong
PEK|Pekín|CN|Capital
PVG|Shanghái|CN|Pudong
CAN|Cantón|CN|Baiyun
ICN|Seúl|KR|Incheon
NRT|Tokio|JP|Narita
HND|Tokio|JP|Haneda
KIX|Osaka|JP|Kansai
SYD|Sídney|AU|Kingsford Smith
MEL|Melbourne|AU|Tullamarine
AKL|Auckland|NZ|Auckland
`;

export const AIRPORTS = Object.fromEntries(
  RAW.trim().split('\n').map((l) => {
    const [iata, city, cc, name] = l.split('|');
    return [iata, { iata, city, cc, name }];
  }),
);

let regionNames = null;
export function countryName(cc) {
  try {
    regionNames ||= new Intl.DisplayNames(['es'], { type: 'region' });
    return regionNames.of(cc) || cc;
  } catch {
    return cc;
  }
}

// Nombre en inglés de las ciudades cuyo nombre en español difiere (los títulos de Wikimedia Commons están en inglés).
export const EN_NAMES = {
  'Londres': 'London', 'París': 'Paris', 'Nueva York': 'New York', 'Ciudad de México': 'Mexico City', 'Roma': 'Rome',
  'Milán': 'Milan', 'Venecia': 'Venice', 'Nápoles': 'Naples', 'Múnich': 'Munich', 'Fráncfort': 'Frankfurt', 'Viena': 'Vienna',
  'Lisboa': 'Lisbon', 'Oporto': 'Porto', 'Dublín': 'Dublin', 'Edimburgo': 'Edinburgh', 'Mánchester': 'Manchester',
  'Ámsterdam': 'Amsterdam', 'Bruselas': 'Brussels', 'Zúrich': 'Zurich', 'Ginebra': 'Geneva', 'Atenas': 'Athens',
  'Estambul': 'Istanbul', 'Copenhague': 'Copenhagen', 'Estocolmo': 'Stockholm', 'Reikiavik': 'Reykjavik', 'Varsovia': 'Warsaw',
  'Praga': 'Prague', 'Bucarest': 'Bucharest', 'Moscú': 'Moscow', 'Dubái': 'Dubai', 'Abu Dabi': 'Abu Dhabi', 'Riad': 'Riyadh',
  'El Cairo': 'Cairo', 'Argel': 'Algiers', 'Túnez': 'Tunis', 'Acra': 'Accra', 'Adís Abeba': 'Addis Ababa',
  'Johannesburgo': 'Johannesburg', 'Ciudad del Cabo': 'Cape Town', 'Los Ángeles': 'Los Angeles', 'Montreal': 'Montreal',
  'La Habana': 'Havana', 'Cuzco': 'Cusco', 'Santiago de Chile': 'Santiago', 'Río de Janeiro': 'Rio de Janeiro',
  'Bombay': 'Mumbai', 'Nueva Delhi': 'New Delhi', 'Yakarta': 'Jakarta', 'Pekín': 'Beijing', 'Shanghái': 'Shanghai',
  'Cantón': 'Guangzhou', 'Seúl': 'Seoul', 'Tokio': 'Tokyo', 'Sídney': 'Sydney', 'Singapur': 'Singapore', 'Hamburgo': 'Hamburg',
  'Berlín': 'Berlin', 'Niza': 'Nice', 'Sevilla': 'Seville', 'Málaga': 'Malaga', 'Palma de Mallorca': 'Palma de Mallorca',
  'Ciudad de Panamá': 'Panama City', 'San José': 'San Jose', 'Bogotá': 'Bogota', 'Medellín': 'Medellin', 'Asunción': 'Asuncion',
  'Brasilia': 'Brasilia', 'Santa Cruz de la Sierra': 'Santa Cruz de la Sierra', 'Bali': 'Bali', 'Cancún': 'Cancun',
};
export const searchName = (city) => EN_NAMES[city] || city;
