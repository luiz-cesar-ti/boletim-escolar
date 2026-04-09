import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Download, Edit2, Trash2 } from 'lucide-react';
import styles from './Dashboard.module.css';
import * as XLSX from 'xlsx';

interface ModeloBoletim {
  id: string;
  nome_modelo: string;
  nome_professora: string;
  nome_disciplina: string;
  cabecalho: string;
  serie: string;
  nivel_ensino: string;
  colunas: string[];
  token_validacao: string;
  criado_em: string;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [modelos, setModelos] = useState<ModeloBoletim[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingModelo, setEditingModelo] = useState<ModeloBoletim | null>(null);

  // Form states
  const [nomeModelo, setNomeModelo] = useState('');
  const [nomeProfessora, setNomeProfessora] = useState('');
  const [nomeDisciplina, setNomeDisciplina] = useState('');
  const [cabecalho, setCabecalho] = useState('');
  const [serie, setSerie] = useState('');
  const [nivelEnsino, setNivelEnsino] = useState('');
  const [colunas, setColunas] = useState<string[]>(['1º Bimestre']);

  useEffect(() => {
    fetchModelos();
  }, []);

  const fetchModelos = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('modelos_boletim')
      .select('*')
      .order('criado_em', { ascending: false });

    if (!error && data) {
      setModelos(data);
    }
    setLoading(false);
  };

  const resetForm = () => {
    setEditingModelo(null);
    setNomeModelo('');
    setNomeProfessora('');
    setNomeDisciplina('');
    setCabecalho('');
    setSerie('');
    setNivelEnsino('');
    setColunas(['1º Bimestre']);
  };

  const handleOpenModal = (modelo?: ModeloBoletim) => {
    if (modelo) {
      setEditingModelo(modelo);
      setNomeModelo(modelo.nome_modelo);
      setNomeProfessora(modelo.nome_professora);
      setNomeDisciplina(modelo.nome_disciplina);
      setCabecalho(modelo.cabecalho);
      setSerie(modelo.serie || '');
      setNivelEnsino(modelo.nivel_ensino || '');
      setColunas(modelo.colunas || []);
    } else {
      resetForm();
    }
    setIsModalOpen(true);
  };

  const handleSaveModelo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const payload = {
      user_id: user.id,
      nome_modelo: nomeModelo,
      nome_professora: nomeProfessora,
      nome_disciplina: nomeDisciplina,
      cabecalho,
      serie,
      nivel_ensino: nivelEnsino,
      colunas,
      // token_validacao is maintained if editing, otherwise generate a random one
      token_validacao: editingModelo ? editingModelo.token_validacao : crypto.randomUUID()
    };

    if (editingModelo) {
      await supabase
        .from('modelos_boletim')
        .update(payload)
        .eq('id', editingModelo.id);
    } else {
      await supabase
        .from('modelos_boletim')
        .insert([payload]);
    }

    setIsModalOpen(false);
    fetchModelos();
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Tem certeza que deseja excluir este modelo?')) {
      await supabase.from('modelos_boletim').delete().eq('id', id);
      fetchModelos();
    }
  };

  const handleAddColuna = () => setColunas([...colunas, `Nova Coluna ${colunas.length + 1}`]);
  
  const handleUpdateColuna = (index: number, value: string) => {
    const newColunas = [...colunas];
    newColunas[index] = value;
    setColunas(newColunas);
  };

  const handleRemoveColuna = (index: number) => {
    const newColunas = colunas.filter((_, i) => i !== index);
    setColunas(newColunas);
  };

  const handleDownloadXlsx = (modelo: ModeloBoletim) => {
    // Aba do ano letivo (Ex: 2025)
    const anoAtual = new Date().getFullYear().toString();
    
    // Cabeçalho da aba principal: "Aluno" + colunas do modelo
    const headerRow = ['Aluno', ...modelo.colunas];
    const wsDados = XLSX.utils.aoa_to_sheet([headerRow]);
    
    // Aba oculta _meta
    const metaData = [
      ['user_id', user?.id],
      ['modelo_id', modelo.id],
      ['token_validacao', modelo.token_validacao]
    ];
    const wsMeta = XLSX.utils.aoa_to_sheet(metaData);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsDados, anoAtual);
    XLSX.utils.book_append_sheet(wb, wsMeta, '_meta');

    // Ocultar aba _meta (SheetJS suporta Hidden via wb.Workbook.Sheets)
    if (!wb.Workbook) wb.Workbook = { Sheets: [] } as any;
    // Mapeia _meta para ficar oculta
    (wb.Workbook as any).Sheets[1] = { Hidden: 1 };

    XLSX.writeFile(wb, `Modelo_${modelo.nome_modelo.replace(/\s+/g, '_')}.xlsx`);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <p className={styles.description}>
          Crie e gerencie os modelos das suas planilhas de boletins. Cada modelo possui suas próprias colunas de avaliações.
        </p>
        <button className="btn btn-primary" onClick={() => handleOpenModal()}>
          <Plus size={20} /> Novo Modelo
        </button>
      </div>

      {loading ? (
        <div className={styles.loadingArea}>
           <div className="spinner" style={{ width: '32px', height: '32px', border: '3px solid var(--border-color)', borderTopColor: 'var(--accent-color)', borderRadius: '50%' }}></div>
        </div>
      ) : (
        <div className={styles.grid}>
          {modelos.map(modelo => (
            <div key={modelo.id} className={`card ${styles.modeloCard}`}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>{modelo.nome_modelo}</h3>
                <span className={styles.badge}>{modelo.colunas.length} Colunas</span>
              </div>
              <div className={styles.cardBody}>
                <p><strong>Disciplina:</strong> {modelo.nome_disciplina}</p>
                <p><strong>Cabeçalho:</strong> {modelo.cabecalho}</p>
                <div className={styles.colunasPreview}>
                  {modelo.colunas.map((col, idx) => (
                    <span key={idx} className={styles.colBadge}>{col}</span>
                  ))}
                </div>
              </div>
              <div className={styles.cardFooter}>
                <button className={`btn btn-outline ${styles.actionBtn}`} onClick={() => handleDownloadXlsx(modelo)}>
                  <Download size={16} /> Baixar XLSX
                </button>
                <div className={styles.cardActions}>
                  <button className={`btn ${styles.iconBtn}`} onClick={() => handleOpenModal(modelo)} title="Editar">
                    <Edit2 size={16} />
                  </button>
                  <button className={`btn ${styles.iconBtn} ${styles.dangerText}`} onClick={() => handleDelete(modelo.id)} title="Excluir">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {modelos.length === 0 && (
            <div className={styles.emptyState}>
              <p>Você ainda não possui nenhum modelo de boletim criado.</p>
            </div>
          )}
        </div>
      )}

      {isModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2>{editingModelo ? 'Editar Modelo' : 'Novo Modelo de Boletim'}</h2>
            </div>
            <form onSubmit={handleSaveModelo} className={styles.modalForm}>
              <div className={styles.formGrid}>
                <div className="formGroup">
                  <label>Nome do modelo</label>
                  <input required className="input-field" value={nomeModelo} onChange={e => setNomeModelo(e.target.value)} />
                </div>
                <div className="formGroup">
                  <label>Nome do Professor(a)</label>
                  <input required className="input-field" value={nomeProfessora} onChange={e => setNomeProfessora(e.target.value)} />
                </div>
                <div className="formGroup">
                  <label>Disciplina</label>
                  <input required className="input-field" value={nomeDisciplina} onChange={e => setNomeDisciplina(e.target.value)} />
                </div>
                <div className="formGroup">
                  <label>Cabeçalho (Ex: Boletim Escolar 2026)</label>
                  <input required className="input-field" value={cabecalho} onChange={e => setCabecalho(e.target.value)} />
                </div>
                <div className="formGroup">
                  <label>Série</label>
                  <input required className="input-field" placeholder="Ex: 5º Ano B" value={serie} onChange={e => setSerie(e.target.value)} />
                </div>
                <div className="formGroup">
                  <label>Nível de ensino</label>
                  <select required className="input-field" value={nivelEnsino} onChange={e => setNivelEnsino(e.target.value)}>
                    <option value="" disabled>Selecione o nivel de ensino</option>
                    <option value="Educação Infantil">Educação Infantil</option>
                    <option value="Ensino Fundamental I">Ensino Fundamental I</option>
                    <option value="Ensino Fundamental II">Ensino Fundamental II</option>
                    <option value="Ensino Médio">Ensino Médio</option>
                  </select>
                </div>
              </div>
              
              <div className={styles.colunasSection}>
                <div className={styles.colunasHeader}>
                  <label>Colunas de Avaliação</label>
                  <button type="button" className={`btn btn-outline ${styles.smallBtn}`} onClick={handleAddColuna}>
                    <Plus size={14} /> Adicionar
                  </button>
                </div>
                <div className={styles.colunasList}>
                  {colunas.map((col, idx) => (
                    <div key={idx} className={styles.colunaRow}>
                      <input 
                        required 
                        className="input-field" 
                        value={col} 
                        onChange={e => handleUpdateColuna(idx, e.target.value)} 
                        placeholder={`Nome da Coluna ${idx + 1}`}
                      />
                      <button type="button" className={`btn ${styles.iconBtn} ${styles.dangerText}`} onClick={() => handleRemoveColuna(idx)} disabled={colunas.length === 1}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Salvar Modelo</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
