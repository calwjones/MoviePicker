'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { importApi } from '@/lib/api';

interface ImportTabProps {
  onImportComplete: () => void;
}

export default function ImportTab({ onImportComplete }: ImportTabProps) {
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState('');

  const handleFolderImport = async (files: FileList) => {
    setImporting(true);
    setImportStatus('Reading export folder...');
    const fileMap: Record<string, File> = {};
    for (let i = 0; i < files.length; i++) {
      const name = files[i].name.toLowerCase();
      if (name === 'watchlist.csv') fileMap.watchlist = files[i];
      if (name === 'ratings.csv') fileMap.ratings = files[i];
      if (name === 'watched.csv') fileMap.watched = files[i];
    }

    const types = ['watchlist', 'ratings', 'watched'] as const;
    const found = types.filter((t) => fileMap[t]);
    if (found.length === 0) {
      setImportStatus('No Letterboxd CSV files found in that folder. Make sure you selected the unzipped export folder.');
      setImporting(false);
      return;
    }

    const summaries: string[] = [];
    for (const type of found) {
      setImportStatus(`Importing ${type}... (${found.indexOf(type) + 1}/${found.length})`);
      try {
        const res = await importApi[type](fileMap[type]);
        const { imported, skipped, failed, total } = res.data.results;
        let s = `${type}: ${imported} imported`;
        if (skipped > 0) s += `, ${skipped} existed`;
        if (failed > 0) s += `, ${failed} failed`;
        s += ` (${total})`;
        summaries.push(s);
      } catch {
        summaries.push(`${type}: failed`);
      }
    }
    setImportStatus(summaries.join(' · '));
    onImportComplete();
    setImporting(false);
  };

  return (
    <motion.div
      key="import"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="glass rounded-2xl p-6"
    >
      <h2 className="text-xl font-semibold mb-2 font-display">
        Import from Letterboxd
      </h2>
      <p className="text-cream-dim text-sm mb-6">
        Export your data from Letterboxd (Settings &rarr; Import &amp; Export), unzip the download, and select the folder below.
        This imports your watchlist, ratings, and watched history in one go.
      </p>

      <label
        className={`flex flex-col items-center justify-center p-8 glass rounded-xl border-2 border-dashed border-cream-dim/30 transition-colors ${
          importing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-amber/50 hover:bg-card-hover'
        }`}
      >
        <svg className="w-10 h-10 text-amber mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <span className="text-cream font-medium mb-1">{importing ? 'Importing...' : 'Select Letterboxd Export Folder'}</span>
        <span className="text-cream-dim text-xs">The unzipped folder containing watchlist.csv, ratings.csv, etc.</span>
        <input
          type="file"
          className="hidden"
          {...({ webkitdirectory: 'true', directory: 'true' } as Record<string, string>)}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) handleFolderImport(e.target.files);
          }}
          disabled={importing}
        />
      </label>

      {importStatus && (
        <div className="mt-4 p-3 glass rounded-xl">
          <p className="text-cream-dim text-sm text-center">{importStatus}</p>
        </div>
      )}
    </motion.div>
  );
}
