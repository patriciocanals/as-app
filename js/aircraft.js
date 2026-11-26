// Catálogo de aviones disponibles en el juego: [id, nombre, artículo de Wikipedia para la imagen]
// La configuración de asientos NO va aquí: se aporta por ruta después de usar la calculadora.
export const AIRCRAFT_GROUPS = [
  { group: 'Airbus', models: [
    ['a220-100', 'Airbus A220-100', 'Airbus A220'],
    ['a220-300', 'Airbus A220-300', 'Airbus A220'],
    ['a318-100', 'Airbus A318-100', 'Airbus A318'],
    ['a319-100', 'Airbus A319-100', 'Airbus A319'],
    ['a320-200', 'Airbus A320-200', 'Airbus A320'],
    ['a321-100', 'Airbus A321-100', 'Airbus A321'],
    ['a321-200', 'Airbus A321-200', 'Airbus A321'],
    ['a319neo', 'Airbus A319neo', 'Airbus A319neo'],
    ['a320neo', 'Airbus A320neo', 'Airbus A320neo'],
    ['a321neo', 'Airbus A321neo', 'Airbus A321neo'],
    ['a321lr', 'Airbus A321LR', 'Airbus A321neo'],
    ['a321xlr', 'Airbus A321XLR', 'Airbus A321XLR'],
    ['a330-200', 'Airbus A330-200', 'Airbus A330'],
    ['a330-300', 'Airbus A330-300', 'Airbus A330'],
    ['a330-800', 'Airbus A330-800', 'Airbus A330neo'],
    ['a330-900', 'Airbus A330-900', 'Airbus A330neo'],
    ['a340-300', 'Airbus A340-300', 'Airbus A340'],
    ['a340-600', 'Airbus A340-600', 'Airbus A340'],
    ['a350-900', 'Airbus A350-900', 'Airbus A350'],
    ['a350-900ulr', 'Airbus A350-900 ULR', 'Airbus A350'],
    ['a350-1000', 'Airbus A350-1000', 'Airbus A350'],
    ['a350-1000ulr', 'Airbus A350-1000 ULR', 'Airbus A350'],
    ['a380-800', 'Airbus A380-800', 'Airbus A380'],
  ] },
  { group: 'Bombardier (Mitsubishi)', models: [
    ['crj200', 'CRJ200', 'Bombardier CRJ200'],
    ['crj550', 'CRJ550', 'Bombardier CRJ700'],
    ['crj700', 'CRJ700', 'Bombardier CRJ700'],
    ['crj705', 'CRJ705', 'Bombardier CRJ700'],
    ['crj900', 'CRJ900', 'Bombardier CRJ900'],
    ['crj1000', 'CRJ1000', 'Bombardier CRJ1000'],
  ] },
  { group: 'Embraer', models: [
    ['erj135', 'Embraer ERJ135', 'Embraer ERJ 145'],
    ['erj140', 'Embraer ERJ140', 'Embraer ERJ 145'],
    ['erj145', 'Embraer ERJ145', 'Embraer ERJ 145'],
    ['erj145xr', 'Embraer ERJ145XR', 'Embraer ERJ 145'],
    ['e170', 'Embraer E170', 'Embraer 170'],
    ['e175', 'Embraer E175', 'Embraer 170'],
    ['e175lr', 'Embraer E175 LR', 'Embraer 170'],
    ['e190', 'Embraer E190', 'Embraer 190'],
    ['e195', 'Embraer E195', 'Embraer 190'],
    ['e190e2', 'Embraer E190 E2', 'Embraer E-Jet E2'],
    ['e195e2', 'Embraer E195 E2', 'Embraer E-Jet E2'],
  ] },
  { group: 'ATR', models: [
    ['atr42-600', 'ATR 42-600', 'ATR 42'],
    ['atr72-600', 'ATR 72-600', 'ATR 72'],
  ] },
  { group: 'De Havilland Canada', models: [
    ['q100', 'De Havilland Q100', 'De Havilland Canada Dash 8'],
    ['q200', 'De Havilland Q200', 'De Havilland Canada Dash 8'],
    ['q300', 'De Havilland Q300', 'De Havilland Canada Dash 8'],
    ['q400', 'De Havilland Q400', 'De Havilland Canada Dash 8'],
  ] },
  { group: 'COMAC', models: [
    ['arj21-700', 'COMAC ARJ21-700', 'COMAC ARJ21'],
    ['c919-100std', 'COMAC C919-100 STD', 'COMAC C919'],
    ['c919-100er', 'COMAC C919-100 ER', 'COMAC C919'],
  ] },
  { group: 'Sukhoi', models: [
    ['ssj100-95b', 'Superjet 100-95B', 'Sukhoi Superjet 100'],
    ['ssj100-95lr', 'Superjet 100-95 LR', 'Sukhoi Superjet 100'],
  ] },
];

export const AIRCRAFT = AIRCRAFT_GROUPS.flatMap((g) => g.models.map(([id, name, wiki]) => ({ id, name, wiki, group: g.group })));
export const aircraftById = (id) => AIRCRAFT.find((a) => a.id === id);
