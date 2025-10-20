export const vehicleBrands = [
  'Toyota',
  'Honda',
  'Ford',
  'Chevrolet',
  'Nissan',
  'BMW',
  'Mercedes-Benz',
  'Volkswagen',
  'Hyundai',
  'Kia',
  'Mazda',
  'Audi',
];

export const vehicleModels = [
  'Corolla',
  'Civic',
  'Mustang',
  'Camaro',
  'Altima',
  'Serie 3',
  'Clase C',
  'Golf',
  'Tucson',
  'Sportage',
  'CX-5',
  'A4',
  'Wrangler',
  'RAV4',
  'Accord',
];

const currentYear = new Date().getFullYear();
const earliestYear = 1995;

export const vehicleYears = Array.from(
  { length: currentYear - earliestYear + 1 },
  (_, index) => currentYear - index,
);

export const priceRange = {
  min: 0,
  max: 200000,
  step: 500,
};
