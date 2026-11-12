import { parseCatalog } from '../src/catalog.mjs';

export function prepareSave(catalog, incoming, previous, role, state) {
  const plant = structuredClone(incoming);
  if (!['draft','submitted','approved'].includes(state)) throw new Error('Estado editorial inválido.');
  if (role === 'contributor') {
    if (state === 'approved') throw new Error('A aprovação exige um revisor.');
    plant.reviewStatus = 'draft';
    plant.photos = plant.photos.map(photo => {
      const old = previous?.photos.find(item => item.id === photo.id);
      return old && JSON.stringify(old) === JSON.stringify(photo) ? photo : { ...photo, reviewStatus: 'draft' };
    });
  }
  if(state==='approved')plant.reviewStatus='reviewed';
  const exists = catalog.plants.some(item => item.id === plant.id);
  const next = parseCatalog({ ...catalog, plants: exists ? catalog.plants.map(item => item.id === plant.id ? plant : item) : [...catalog.plants, plant] });
  return next.plants.find(item => item.id === plant.id);
}

export function validPhotoName(name) {
  return /^inat-[1-9]\d*\.(jpg|jpeg|png|webp)$/.test(name);
}
