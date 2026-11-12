const excluded = new Set(['Campinarana','Campo de Várzea','Floresta de Igapó','Floresta de Terra Firme','Floresta de Várzea','Floresta Estacional Perenifólia','Savana Amazônica']);
export const habitatNames = ['Área Antrópica','Caatinga (stricto sensu)','Campo de Altitude','Campo Limpo','Campo rupestre','Carrasco','Cerrado (lato sensu)','Floresta Ciliar ou Galeria','Floresta Estacional Decidual','Floresta Estacional Semidecidual','Floresta Ombrófila (= Floresta Pluvial)','Floresta Ombrófila Mista','Manguezal','Palmeiral','Restinga','Vegetação Aquática','Vegetação Sobre Afloramentos Rochosos'].filter(x=>!excluded.has(x));
export async function habitatRequest(request, bucket, name, input) {
  if (!habitatNames.includes(name)) return Response.json({error:'Ambiente inválido.'},{status:400});
  const key = `habitat-drafts/${encodeURIComponent(name)}.json`;
  if (request.method === 'GET') {
    const object = await bucket.get(key);
    return Response.json(object ? {draft:await object.json(),etag:object.etag} : {draft:null,etag:null}, {headers:{'cache-control':'no-store'}});
  }
  if (typeof input.image !== 'string' || input.image.length > 2_800_000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(input.image) ||
      typeof input.source !== 'string' || !/^https?:\/\//.test(input.source) || input.source.length > 2000 ||
      typeof input.creator !== 'string' || !input.creator.trim() || input.creator.length > 200 ||
      typeof input.license !== 'string' || !input.license.trim() || input.license.length > 300 ||
      !(input.etag === null || typeof input.etag === 'string')) return Response.json({error:'Informe imagem, autor, origem e licença válidos.'},{status:400});
  const result = await bucket.put(key, JSON.stringify({habitat:name,image:input.image,source:input.source.trim(),creator:input.creator.trim(),license:input.license.trim(),updatedAt:new Date().toISOString()}), {onlyIf:input.etag ? {etagMatches:input.etag} : {etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});
  if (!result) return Response.json({error:'Esta imagem foi alterada por outra pessoa. Recarregue antes de salvar.'},{status:409});
  return Response.json({ok:true,etag:result.etag});
}
