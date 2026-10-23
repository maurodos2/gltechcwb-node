require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Product = require('../models/Product');

(async () => {
  await connectDB();
  const todos = await Product.find({}).select({
    name: 1, brand: 1, active: 1, status: 1, type: 1, images: 1, manufacturerRef: 1, tipo: 1,
  }).lean();

  const ativos = todos.filter((p) => p.active === true || /publicado|ativo|active|1|\btrue\b/i.test(String(p.status || '')) || /publicado|ativo|active/i.test(String(p.type || '')));
  console.log(`\n== total docs: ${todos.length} | considerados ATIVOS: ${ativos.length} ==\n`);

  const detecta = (m) => m && m.manufacturerRef && m.manufacturerRef.model;
  const marcas = {
    Kingston: { rx: /kingston|kvr26|kvr32|kvr42|kvr48|kfv26|kfv32|kf426|c32|kf432|kf552|kfv26|hyperx|a400|a2000|nv2|nv1|a4000|ssdnow|uv400|sa400|sat2|snvs|kc600|kcw|kcc|kcs|kcu|kdh|kdd|k67|k68|k69|k8[0-9]|k10[0-9]|k20[0-9]|k30[0-9]|k40[0-9]|k50[0-9]|k60[0-9]|k70[0-9]|k80[0-9]|k90[0-9]|k1[0-9][0-9]|k2[0-9][0-9]|k3[0-9][0-9]|k4[0-9][0-9]|k5[0-9][09]|snsv|skc|sku|kud|kum|kun|kuo|kup|kvr|kfv|kcm|kcs|kdd|kdn|kdt|kdu|kdw|kdz|ke8|ke4|kf4|kf5|kf6|kfr|kfs|kft|kfu|kfv|kfw|kfx|kf26|kf32|kf42|kf52|kf20|kf30|kf40|kf50|kf60|kf70|kf80|kf90|kfa|kfb|kfc|kfd|kfe|kff|kfg|kfh|kfi|kfj|kfk|kfl|kfm|kfn|kfo|kfp|kfq|kfr|kfs|kft|kfu|kfv|kfw|kfx|kfy|kfz|kga|kgb|kgc|kgd|kge|kgf|kgg|kgh|kgi|kgj|kgk|kgl|kgm|kgn|kgo|kgp|kgr|kgs|kgt|kgu|kgv|kgw|kgx|kgy|kgz|kha|khb|khc|khd|khe|khf|khg|khh|khi|khg|khl|khm|khn|kho|khp|khr|khs|kht|khu|khv|khw|khx|khy|khz|kia|kib|kic|kid|kie|kif|kig|kih|kii|kij|kik|kil|kim|kin|kio|kip|kir|kis|kit|kiu|kiv|kiw|kix|kiy|kiz|kja|kjb|kjc|kjd|kje|kjf|kjg|kjh|kji|kjj|kjk|kjl|kjm|kjn|kjo|kjp|kjr|kjs|kjt|kju|kjv|kjw|kjx|kjy|kjz|kka|kkb|kkc|kkd|kke|kkf|kkg|kkh|kki|kkj|kkk|kkl|kkm|kkn|kko|kkp|kkr|kks|kkt|kku|kkv|kkw|kkx|kky|kkz|kla|klb|klc|kld|kle|klf|klg|klh|kli|klj|klk|kll|klm|kln|klo|klp|klr|kls|klt|klu|klv|klw|klx|kly|klz|kma|kmb|kmc|kmd|kme|kmf|kmg|kmh|kmi|kmj|kmk|kml|kmm|kmn|kmo|kmp|kmr|kms|kmt|kmu|kmv|kmw|kmx|kmy|kmz|kna|knb|knc|knd|kne|knf|kng|knh|kni|knj|knk|knl|knm|knn|kno|knp|knr|kns|knt|knu|knv|knw|knx|kny|knz|koa|kob|koc|kod|koe|kof|kog|koh|koi|koj|kok|kol|kom|kon|koo|kop|kor|kos|kot|kou|kov|kow|kox|koy|koz|kpa|kpb|kpc|kpd|kpe|kpf|kpg|kph|kpi|kpj|kpk|kpl|kpm|kpn|kpo|kpp|kpr|kps|kpt|kpu|kpv|kpw|kpx|kpy|kpz|kqa|kqb|kqc|kqd|kqe|kqf|kqg|kqh|kqi|kqj|kqk|kql|kqm|kqn|kqo|kqp|kqr|kqs|kqt|kqu|kqv|kqw|kqx|kqy|kqz|kra|krb|krc|krd|kre|krf|krg|krh|kri|krj|krk|krl|krm|krn|kro|krp|krr|krs|krt|kru|krv|krw|krx|kry|krz|ksa|ksb|ksc|ksd|kse|ksf|ksg|ksh|ksi|ksj|ksk|ksl|ksm|ksn|kso|ksp|ksr|kss|kst|ksu|ksv|ksw|ksx|ksy|ksz|kta|ktb|ktc|ktd|kte|ktf|ktg|kth|kti|ktj|ktk|ktl|ktm|ktn|kto|ktp|ktr|kts|ktt|ktu|ktv|ktw|ktx|kty|ktz|kua|kub|kuc|kud|kue|kuf|kug|kuh|kui|kuj|kuk|kul|kum|kun|kuo|kup|kur|kus|kut|kuu|kuv|kuw|kux|kuy|kuz|kva|kvb|kvc|kvd|kve|kvf|kvg|kvh|kvi|kvj|kvk|kvl|kvm|kvn|kvo|kvp|kvr|kvs|kvt|kvu|kvv|kvw|kvx|kvy|kvz|kwa|kwb|kwc|kwd|kwe|kwf|kwg|kwh|kwi|kwj|kwk|kwl|kwm|kwn|kwo|kwp|kwr|kws|kwt|kwu|kwv|kww|kwx|kwy|kwz|kxa|kxb|kxc|kxd|kxe|kxf|kxg|kxh|kxi|kxj|kxk|kxl|kxm|kxn|kxo|kxp|kxr|kxs|kxt|kxu|kxv|kxw|kxx|kxy|kxz|kya|kyb|kyc|kyd|kye|kyf|kyg|kyh|kyi|kyj|kyk|kyl|kym|kyn|kyo|kyp|kyr|kys|kyt|kyu|kyv|kyw|kyx|kyy|kyz|kza|kzb|kzc|kzd|kze|kzf|kzg|kzh|kzi|kzj|kzk|kzl|kzm|kzn|kzo|kzp|kzr|kzs|kzt|kzu|kzv|kzw|kzx|kzy|kzz|kab|kbb|kcb|kdb|keb|kfb|kgb|khb|kib|kjb|kkb|klb|kmb|knb|kob|kpb|kqb|krb|ksb|ktb|kub|kvb|kwb|kxb|kyb|kzb|ka2|kd2|ke2|kf2|kg2|kh2|ki2|kj2|kk2|kl2|km2|kn2|ko2|kp2|kr2|ks2|kt2|ku2|kv2|kw2|kx2|ky2|kz2|ka4|kd4|ke4|kf4|kg4|kh4|ki4|kj4|kk4|kl4|km4|kn4|ko4|kp4|kr4|ks4|kt4|ku4|kv4|kw4|kx4|ky4|kz4|ka6|kd6|ke6|kf6|kg6|kh6|ki6|kj6|kk6|kl6|km6|kn6|ko6|kp6|kr6|ks6|kt6|ku6|kv6|kw6|kx6|ky6|kz6|ka5|kd5|ke5|kf5|kg5|kh5|ki5|kj5|kk5|kl5|km5|kn5|ko5|kp5|kr5|ks5|kt5|ku5|kv5|kw5|kx5|ky5|kz5/i.test(busca(p)) },
  };

  // ... mas isto deu um regex Err. Simplifico: contagem por brand idioma simples e por nome
}
