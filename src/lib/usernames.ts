/** Username rules (Feature 22). Mirrored by the frontend's username.util.ts (format only) and the DB CHECK. */
export const USERNAME_RE = /^[a-z0-9_][a-z0-9_.]{1,48}[a-z0-9_]$/;

export function isUsernameFormatValid(u: string): boolean {
  return u.length <= 50 && USERNAME_RE.test(u) && !u.includes('..');
}

// ── Appendix A (spec 2026-10-11). Owner-audited; edit here only. ──────────────
const ROUTES = ['u','me','yo','api','admin','profile','perfil','plan','planes','shared','compartido','ciudad','ciudades','guides','guias','about','nosotros','terms','terminos','privacy','privacidad','karma','tokens','karma-history','my-trips','mis-viajes','ai-planning','feed','following','followers','siguiendo','seguidores','rankings','ranking','trofeos','trophies','notifications','notificaciones','login','logout','registro','register','signup','settings','ajustes','configuracion','help','ayuda','soporte','support','demasiadas-visitas','not-found','www','mail','email'];
const BRAND = ['tripilove','tripilove_official','tripilove.official','tripiloveoficial','tripi','travelbestie','travelingbestie','underagegiant','miel','asistentemiel','oficial','official','staff','equipo','team','moderador','moderator','mod','root','system','sistema','null','undefined','anonymous','everyone'];
const SPANISH = ['administrador','administracion','administradora','contacto','atencion','atencionalcliente','servicioalcliente','seguridad','verificacion','verificado','verificada','cuenta','cuentas','usuario','usuarios','invitado','anonimo','anonima','moderacion','denuncias','reclamos','pagos','pago','facturacion','cobros','reembolso','reembolsos','premios','premio','sorteo','sorteos','concurso','ganador','gratis','regalo','regalos','promocion','promociones','ofertas','noticias','prensa','legal','bot','robot','paypal','mercadopago','webpay','transbank','carabineros','policia','pdi','gobierno','presidente','presidencia','sernatur','ministerio','municipalidad','sii','todos','nadie','acab'];
const SUBSTRING = ['conchetumare','conchetumadre','conchesumadre','conchatumadre','culiao','culiado','culiaa','aweonao','ahueonao','aweonado','chupapico','chupala','chupalo','maricon','maraco','mierda','hijodeputa','hijueputa','hijoeputa','malparido','gonorrea','pendejo','pendeja','cabron','cabrona','culero','follar','violador','violacion','pedofilo','pedofila','pedofilia','mongolico','subnormal','travelo','sidoso','hitler','fuck','fucker','motherfucker','bitch','nigger','nigga','faggot','retard','whore','slut','porn','porno','xxx','trabuco','travuco','travesti','travesano','weon','hueon','huevon','paco'];
const TOKEN = ['puta','puto','putas','putos','pico','raja','pene','verga','pajera','zorra','perra','cono','joder','culo','ctm','csm','ql','qlao','qla','tula','manguaco','nazi','pedo','rape','sex','sexo','dick','cock','cunt','ass','shit','pussy','kkk','isis'];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't' };
const normalize = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[013457]/g, d => LEET[d]);
const strip = (s: string): string => s.replace(/[_.-]/g, '');

const EXACT_SET = new Set([...ROUTES, ...BRAND, ...SPANISH].flatMap(w => [normalize(w), strip(normalize(w))]));
const SUBSTRING_LIST = SUBSTRING.map(normalize);
const TOKEN_SET = new Set(TOKEN.map(normalize));

function isReserved(username: string): boolean {
  const n = normalize(username);
  const s = strip(n);
  if (EXACT_SET.has(n) || EXACT_SET.has(s)) return true;
  if (SUBSTRING_LIST.some(w => s.includes(w))) return true;
  return TOKEN_SET.has(s) || n.split(/[_.]/).some(t => TOKEN_SET.has(t));
}

export function isUsernameAllowed(u: string): boolean {
  return isUsernameFormatValid(u) && !isReserved(u);
}
