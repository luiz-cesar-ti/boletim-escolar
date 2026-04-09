import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import JSZip from 'jszip';
import { UploadCloud, CheckCircle2, AlertCircle, CheckSquare, Download } from 'lucide-react';
import styles from './Boletins.module.css';
import { MontserratBase64, MontserratBoldBase64 } from '../fonts';
import { logoAlphaBase64 } from '../logoAlpha';

interface ModeloConfig {
  nome_professora: string;
  nome_disciplina: string;
  cabecalho: string;
  serie: string;
  nivel_ensino: string;
  colunas: string[];
}

interface AlunoNota {
  nome: string;
  notas: Record<string, any>;
  ano: string;
}

export default function Boletins() {
  const [fileState, setFileState] = useState<'idle' | 'validating' | 'validated' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  
  const [anosLetivos, setAnosLetivos] = useState<string[]>([]);
  const [alunos, setAlunos] = useState<{ [nome: string]: boolean }>({}); 
  const [parsedData, setParsedData] = useState<AlunoNota[]>([]);
  const [modeloConfig, setModeloConfig] = useState<ModeloConfig | null>(null);

  const [formatoPDF, setFormatoPDF] = useState<'multiplo' | 'unico'>('multiplo');
  const [opcaoAnos, setOpcaoAnos] = useState<'recente' | 'todos'>('recente');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileState('validating');
    setErrorMessage('');
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, { type: 'buffer' });
      
      if (!wb.SheetNames.includes('_meta')) {
        throw new Error('Arquivo inválido: Aba _meta não encontrada.');
      }

      const wsMeta = wb.Sheets['_meta'];
      const metaData = XLSX.utils.sheet_to_json(wsMeta, { header: 1 }) as string[][];
      
      let token = '';
      metaData.forEach(row => {
        if (row[0] === 'token_validacao') token = row[1];
      });

      if (!token) {
        throw new Error('Este arquivo possui a aba _meta corrompida. Token ausente.');
      }

      // Validação no Supabase
      const { data, error } = await supabase
        .from('modelos_boletim')
        .select('*')
        .eq('token_validacao', token)
        .single();
        
      if (error || !data) {
        throw new Error('Este arquivo não foi gerado por este sistema ou pertence a outra professora.');
      }

      setModeloConfig({
        nome_professora: data.nome_professora,
        nome_disciplina: data.nome_disciplina,
        cabecalho: data.cabecalho,
        serie: data.serie || '',
        nivel_ensino: data.nivel_ensino || '',
        colunas: data.colunas || []
      });

      // Leitura dos dados das abas dos anos letivos (todas exceto _meta)
      const dataAbas = wb.SheetNames.filter(name => name !== '_meta');
      if (dataAbas.length === 0) throw new Error('O arquivo não possui abas de anos letivos.');
      setAnosLetivos(dataAbas);

      const allData: AlunoNota[] = [];
      const distinctAlunos = new Set<string>();

      dataAbas.forEach(ano => {
        const ws = wb.Sheets[ano];
        const rows = XLSX.utils.sheet_to_json(ws) as any[];
        rows.forEach(row => {
          const nomeAluno = row['Aluno'];
          if (nomeAluno && nomeAluno.trim()) {
            distinctAlunos.add(nomeAluno);
            allData.push({
              nome: nomeAluno,
              notas: row,
              ano
            });
          }
        });
      });

      const initialSelection: { [nome: string]: boolean } = {};
      distinctAlunos.forEach(al => initialSelection[al] = true);
      
      setAlunos(initialSelection);
      setParsedData(allData);
      setFileState('validated');

    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao processar o arquivo.');
      setFileState('error');
    }
    // limpar input para permitir re-upload do mesmo
    e.target.value = '';
  };

  const handleToggleAluno = (nome: string) => {
    setAlunos(prev => ({ ...prev, [nome]: !prev[nome] }));
  };

  const handleToggleAll = (select: boolean) => {
    const updated: any = {};
    Object.keys(alunos).forEach(aluno => {
      updated[aluno] = select;
    });
    setAlunos(updated);
  };

  // Helper inside component to preload logo dimensions
  const loadLogoDimensions = (base64: string): Promise<{w: number, h: number}> => {
    return new Promise(resolve => {
      if (!base64) return resolve({w: 0, h: 0});
      const img = new Image();
      img.onload = () => resolve({ w: img.width, h: img.height });
      img.onerror = () => resolve({w: 0, h: 0});
      img.src = base64;
    });
  };

  // Processo de geração
  const handleGenerate = async () => {
    setIsGenerating(true);
    
    try {
      const alphaDimens = await loadLogoDimensions(logoAlphaBase64);

      const alunosSelecionados = Object.keys(alunos).filter(k => alunos[k]);
      if (alunosSelecionados.length === 0) {
        alert('Selecione ao menos um aluno.');
        setIsGenerating(false);
        return;
      }

      // Define abas/anos a gerar
      const anosParaGerar = opcaoAnos === 'recente' 
        ? [anosLetivos[anosLetivos.length - 1]] 
        : anosLetivos;

      if (formatoPDF === 'unico') {
        const doc = new jsPDF({ orientation: 'landscape' });
        let firstPage = true;

        alunosSelecionados.forEach(alunoNome => {
          anosParaGerar.forEach(ano => {
            const linhaData = parsedData.find(d => d.nome === alunoNome && d.ano === ano);
            if (linhaData) {
              if (!firstPage) doc.addPage();
              firstPage = false;
              drawBoletimPage(doc, alphaDimens, modeloConfig!, linhaData);
            }
          });
        });
        doc.save('Boletins_Consolidados.pdf');
        
      } else {
        // Múltiplos PDFs em um ZIP
        const zip = new JSZip();
        
        alunosSelecionados.forEach(alunoNome => {
          const doc = new jsPDF({ orientation: 'landscape' });
          let firstPage = true;

          anosParaGerar.forEach(ano => {
            const linhaData = parsedData.find(d => d.nome === alunoNome && d.ano === ano);
            if (linhaData) {
              if (!firstPage) doc.addPage();
              firstPage = false;
              drawBoletimPage(doc, alphaDimens, modeloConfig!, linhaData);
            }
          });
          
          if (!firstPage) {
            // adiciona PDF ao zip se houver páginas
            const pdfBlob = doc.output('blob');
            zip.file(`Boletim_${alunoNome.replace(/\s+/g, '_')}.pdf`, pdfBlob);
          }
        });

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Boletins.zip';
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error(error);
      alert('Ocorreu um erro ao gerar os boletins.');
    } finally {
      setIsGenerating(false);
    }
  };

  const drawBoletimPage = (
    doc: any, 
    alphaDimens: {w: number, h: number},
    config: ModeloConfig, 
    data: AlunoNota
  ) => {
    // Adiciona as fontes
    doc.addFileToVFS('Montserrat-Regular.ttf', MontserratBase64);
    doc.addFont('Montserrat-Regular.ttf', 'Montserrat', 'normal');
    doc.addFileToVFS('Montserrat-Bold.ttf', MontserratBoldBase64);
    doc.addFont('Montserrat-Bold.ttf', 'MontserratBold', 'normal');

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 28;
    
    // --- 1. CABEÇALHO ESCURO ---
    doc.setFillColor(26, 39, 68); // #1a2744 azul marinho
    doc.rect(0, 0, pageWidth, 70 * 0.264583, 'F'); // convertendo pixels para mm para altura do retângulo
    
    // Nome do Colégio
    doc.setFont('MontserratBold', 'normal');
    // ~20px = ~15pt
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255); 
    doc.text(config.cabecalho, pageWidth / 2, (70 * 0.264583) / 2, { align: 'center', baseline: 'middle' });

    // Ano Letivo
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(`Ano Letivo: ${data.ano}`, pageWidth - margin, (70 * 0.264583) / 2, { align: 'right', baseline: 'middle' });


    // --- 2. FAIXA DE INFORMAÇÕES (Professora e Disciplina) ---
    const infoY = (70 * 0.264583) + 6; // Abaixo do cabeçalho
    doc.setFillColor(248, 250, 252); // slate-50
    doc.rect(margin, infoY, pageWidth - (margin * 2), 10, 'F');

    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85); // slate-700
    doc.setFont('helvetica', 'bold');
    doc.text('Professora:', margin + 4, infoY + 6.5);
    doc.setFont('helvetica', 'normal');
    doc.text(config.nome_professora, margin + 26, infoY + 6.5);

    doc.setFont('helvetica', 'bold');
    doc.text('Disciplina:', margin + 90, infoY + 6.5);
    doc.setFont('helvetica', 'normal');
    doc.text(config.nome_disciplina, margin + 109, infoY + 6.5);

    if (config.nivel_ensino) {
      doc.setFont('helvetica', 'bold');
      doc.text('Nível:', margin + 155, infoY + 6.5);
      doc.setFont('helvetica', 'normal');
      doc.text(config.nivel_ensino, margin + 166, infoY + 6.5);
    }
    
    if (config.serie) {
      doc.setFont('helvetica', 'bold');
      doc.text('Série:', margin + 205, infoY + 6.5);
      doc.setFont('helvetica', 'normal');
      doc.text(config.serie, margin + 216, infoY + 6.5);
    }


    // --- 3. BLOCO DO NOME DO ALUNO ---
    const alunoY = infoY + 14;
    doc.setFillColor(224, 242, 254); // sky-100 (azul claro)
    doc.rect(margin, alunoY, pageWidth - (margin * 2), 12, 'F');
    // Borda esquerda colorida
    doc.setDrawColor(3, 105, 161); // sky-700
    doc.setLineWidth(1);
    doc.line(margin, alunoY, margin, alunoY + 12);

    doc.setFontSize(14); // Fonte maior pro aluno
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(3, 105, 161); // sky-700
    doc.text(`Aluno(a): ${data.nome}`, margin + 5, alunoY + 8);


    // --- 4. TABELA DE NOTAS ---
    const head = [config.colunas];
    const body = [config.colunas.map(colName => {
      const val = data.notas[colName];
      return val !== undefined && val !== null && val !== '' ? String(val) : '-';
    })];

    let startY = alunoY + 16;
    
    // autoTable setup
    autoTable(doc, {
      startY,
      margin: { left: margin, right: margin, bottom: 40 }, // margem de 40 no bottom pra não sobrepor rodapé
      head: head,
      body: body,
      theme: 'grid',
      styles: {
        fontSize: 13, // notas maiores
        cellPadding: { top: 6, right: 10, bottom: 6, left: 10 }, // padding ajustado
        valign: 'middle',
        halign: 'center',
        font: 'helvetica',
        lineColor: [221, 227, 237], // bordas sutis #dde3ed
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: [255, 255, 255], 
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        fontSize: 11,
      },
      alternateRowStyles: {
        fillColor: [255, 255, 255] 
      },
      bodyStyles: {
        fillColor: [255, 255, 255],
        textColor: [15, 23, 42],
        fontStyle: 'bold' 
      }
    });

    // --- 5. RODAPÉ E ASSINATURA ---
    const today = new Date();
    const dateStr = today.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    
    const footerY = pageHeight - 16; // posicionamento basico rodapé

    // Linha superior do rodapé
    doc.setDrawColor(221, 227, 237);
    doc.setLineWidth(0.3);
    doc.line(margin, footerY - 8, pageWidth - margin, footerY - 8);

    // Coluna esquerda: Logo Alpha.png alinhado à esquerda
    if (logoAlphaBase64 && alphaDimens.w > 0 && alphaDimens.h > 0) {
      const targetHeight = 11.9; // ~45px em mm aprox
      const ratio = alphaDimens.w / alphaDimens.h;
      const targetWidth = targetHeight * ratio;
      try {
        doc.addImage(logoAlphaBase64, 'PNG', margin, footerY - (targetHeight / 2), targetWidth, targetHeight, '', 'FAST');
      } catch (e) {
        console.warn('Erro ao carregar o logo Alpha');
      }
    }

    // Coluna central: Assinatura
    const sigX = pageWidth / 2;
    const sigY = footerY - 2;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59); // slate-800
    doc.text(config.nome_professora, sigX, sigY, { align: 'center' });
    
    // Linha de assinatura
    doc.setDrawColor(15, 23, 42); // slate-900
    doc.setLineWidth(0.3);
    // Draw line just under the name
    doc.line(sigX - 30, sigY + 2, sigX + 30, sigY + 2);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139); // Cinza
    doc.text('Assinatura do(a) Professor(a)', sigX, sigY + 6, { align: 'center' });

    // Coluna direita: Cidade/Data e Paginação
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105); // slate-600
    doc.text(`São Vicente, ${dateStr}`, pageWidth - margin, footerY, { align: 'right' });
    doc.text(`Página ${(doc.internal as any).getNumberOfPages()}`, pageWidth - margin, footerY + 5, { align: 'right' });
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <p className={styles.description}>Faça o upload do Excel gerado pelo sistema e preenchido com as notas. Nós cuidamos do resto para gerar PDFs perfeitos.</p>
      </div>

      <div className="card">
        {fileState === 'idle' || fileState === 'validating' || fileState === 'error' ? (
          <div className={styles.uploadArea}>
            <UploadCloud size={48} className={styles.uploadIcon} />
            <h3>Carregar Arquivo XLSX</h3>
            <p className={styles.uploadHint}>Formatos aceitos: .xlsx preenchido de um modelo válido</p>
            
            <label className={`btn btn-primary ${styles.uploadBtn}`}>
              {fileState === 'validating' ? 'Validando...' : 'Selecionar Arquivo'}
              <input type="file" accept=".xlsx" onChange={handleFileUpload} className={styles.hiddenInput} disabled={fileState === 'validating'} />
            </label>

            {fileState === 'error' && (
              <div className={styles.errorAlert}>
                <AlertCircle size={20} />
                <span>{errorMessage}</span>
              </div>
            )}
          </div>
        ) : (
          <div className={styles.validatedFlow}>
            <div className={styles.successHeader}>
              <CheckCircle2 size={24} className={styles.successIcon} />
              <div>
                <h3 style={{ margin: 0 }}>Arquivo Validado com Sucesso</h3>
                <p style={{ margin: 0, color: 'var(--text-muted)' }}>Modelo: {modeloConfig?.nome_disciplina} ({modeloConfig?.colunas.length} colunas)</p>
              </div>
              <button 
                className="btn btn-outline" 
                style={{ marginLeft: 'auto' }}
                onClick={() => setFileState('idle')}
              >
                Trocar Arquivo
              </button>
            </div>

            <div className={styles.flowGrid}>
              <div className={styles.flowCard}>
                <h4 className={styles.flowCardTitle}>1. Seleção de Alunos</h4>
                <div className={styles.alunosList}>
                  <div className={styles.alunosActions}>
                    <button className="btn btn-outline" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }} onClick={() => handleToggleAll(true)}><CheckSquare size={14}/> Todos</button>
                    <button className="btn btn-outline" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }} onClick={() => handleToggleAll(false)}> Nenhum</button>
                  </div>
                  <div className={styles.listaScroll}>
                    {Object.keys(alunos).map(aluno => (
                      <label key={aluno} className={styles.alunoItem}>
                        <input type="checkbox" checked={alunos[aluno]} onChange={() => handleToggleAluno(aluno)} />
                        {aluno}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className={styles.flowCard}>
                <h4 className={styles.flowCardTitle}>2. Opções de Geração</h4>
                
                <div className={styles.opcaoGroup}>
                  <label className={styles.opcaoLabel}>Formato do PDF</label>
                  <select className="input-field" value={formatoPDF} onChange={e => setFormatoPDF(e.target.value as any)}>
                    <option value="multiplo">Um PDF Arquivo por Aluno (ZIP)</option>
                    <option value="unico">PDF Único Consolidado</option>
                  </select>
                </div>

                {anosLetivos.length > 1 && (
                  <div className={styles.opcaoGroup}>
                    <label className={styles.opcaoLabel}>Anos Letivos (Múltiplas Abas Detectadas)</label>
                    <select className="input-field" value={opcaoAnos} onChange={e => setOpcaoAnos(e.target.value as any)}>
                      <option value="recente">Apenas o Ano Mais Recente ({anosLetivos[anosLetivos.length - 1]})</option>
                      <option value="todos">Todos os Anos (Histórico Completo)</option>
                    </select>
                  </div>
                )}

                <div className={styles.generateAction}>
                  <button 
                    className="btn btn-primary" 
                    style={{ width: '100%', padding: '1rem', marginTop: '1.5rem', fontSize: '1.1rem' }} 
                    onClick={handleGenerate}
                    disabled={isGenerating || Object.values(alunos).filter(Boolean).length === 0}
                  >
                    {isGenerating ? (
                      <>
                        <div style={{ width: '20px', height: '20px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', marginRight: '8px', verticalAlign: 'middle', animation: 'spin 1s linear infinite' }}></div>
                        Gerando... Aguarde
                      </>
                    ) : (
                      <><Download size={20} /> Processar e Baixar PDFs</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
