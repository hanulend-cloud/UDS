// STEP 루트 수 어림(2026-11-06): node test/step-roots.mjs
import { readFileSync } from 'node:fs';
import { stepRootEstimate, stepRootProfile } from '../src/engine/shape/step-roots.js';
import { ok, done } from './mech3d-util.mjs';

const f = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
ok(stepRootEstimate(f('mech3d-led-sample.stp')) === 11, '평평한 파일(부품 11개) = 루트 11');
const asm = `DATA;
#1 = PRODUCT_DEFINITION('design','',#10,#11);
#2 = PRODUCT_DEFINITION('design','',#12,#11);
#3 = PRODUCT_DEFINITION('design','',#13,#11);
#4 = PRODUCT_DEFINITION('design','',#14,#11);
#20 = NEXT_ASSEMBLY_USAGE_OCCURRENCE('1','a','',#1,#2,$);
#21 = NEXT_ASSEMBLY_USAGE_OCCURRENCE('2','b',$,#1,#3,$);
#22 = NEXT_ASSEMBLY_USAGE_OCCURRENCE ( '3', 'c', '', #1, #4, $ );
ENDSEC;`;
ok(stepRootEstimate(asm) === 1, '조립품 하나(하위 3개) = 루트 1');
ok(stepRootEstimate(asm.replace(/#22 = [^\n]*\n/, '')) === 2, '하위로 안 묶인 부품은 따로 루트');
ok(stepRootEstimate('DATA;\n#1 = MANIFOLD_SOLID_BREP(\'\',#2);\nENDSEC;') === 0, '제품 구조 없음 = 0(모름)');
ok(stepRootEstimate('#5 = PRODUCT_DEFINITION_SHAPE(\'\',\'\',#6);') === 0, 'PRODUCT_DEFINITION_SHAPE 는 세지 않음');
const big = { preview: true, big: true };
ok(stepRootProfile(big, 1).preview === false && big.preview === true, 'single root skips duplicate coarse mesh without mutation');
ok(stepRootProfile(big, 2) === big && stepRootProfile(big, 0) === big, 'multiple or unknown roots keep preview');
done();
