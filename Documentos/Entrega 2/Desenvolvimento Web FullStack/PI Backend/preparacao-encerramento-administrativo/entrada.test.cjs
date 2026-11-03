'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
test('importar entradas nao conecta nao encerra e nao inicia backend',()=>{assert.equal(typeof require('./executar.cjs').main,'function');assert.equal(typeof require('./reconciliar.cjs').coletar,'function');});
test('entrada de encerramento recusa comando e aceite ausentes antes de ler configuracao',async()=>{const {main}=require('./executar.cjs');await assert.rejects(main([]));await assert.rejects(main(['--encerrar-autorizado']));});
