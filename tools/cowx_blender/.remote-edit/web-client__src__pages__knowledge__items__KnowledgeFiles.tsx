import { loggerService } from '@logger'
import Ellipsis from '@renderer/components/Ellipsis'
import { useFiles } from '@renderer/hooks/useFiles'
import { useKnowledge } from '@renderer/hooks/useKnowledge'
import FileItem from '@renderer/pages/files/FileItem'
import StatusIcon from '@renderer/pages/knowledge/components/StatusIcon'
import FileManager from '@renderer/services/FileManager'
import { getProviderName } from '@renderer/services/ProviderService'
import type { FileMetadata, KnowledgeBase, KnowledgeItem } from '@renderer/types'
import { isKnowledgeFileItem } from '@renderer/types'
import { formatFileSize, mime2type, uuid } from '@renderer/utils'
import { bookExts, documentExts, textExts, thirdPartyApplicationExts } from '@shared/config/constant'
import { Button, Tooltip, Upload } from 'antd'
import dayjs from 'dayjs'
import type { FC, ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

const logger = loggerService.withContext('KnowledgeFiles')

import { DeleteIcon } from '@renderer/components/Icons'
import { DynamicVirtualList } from '@renderer/components/VirtualList'
import { PlusIcon } from 'lucide-react'

import {
  ClickableSpan,
  FlexAlignCenter,
  ItemContainer,
  ItemHeader,
  KnowledgeEmptyView,
  RefreshIcon,
  ResponsiveButton,
  StatusIconWrapper
} from '../KnowledgeContent'

const { Dragger } = Upload

interface KnowledgeContentProps {
  selectedBase: KnowledgeBase
  progressMap: Map<string, number>
  preprocessMap: Map<string, boolean>
  graphAction?: ReactNode
  graphNotice?: ReactNode
}

const fileTypes = [...bookExts, ...thirdPartyApplicationExts, ...documentExts, ...textExts]

const getDisplayTime = (item: KnowledgeItem) => {
  const timestamp = item.updated_at && item.updated_at > item.created_at ? item.updated_at : item.created_at
  return dayjs(timestamp).format('MM-DD HH:mm')
}

const KnowledgeFiles: FC<KnowledgeContentProps> = ({ selectedBase, progressMap, preprocessMap, graphAction, graphNotice }) => {
  const { t } = useTranslation()
  const [windowHeight, setWindowHeight] = useState(window.innerHeight)
  const { onSelectFile, selecting } = useFiles({ extensions: fileTypes })
  const isRealElectron = typeof window.electron?.process?.platform === 'string'

  const { base, fileItems, addFiles, refreshItem, removeItem, getProcessingStatus } = useKnowledge(
    selectedBase.id || ''
  )

  useEffect(() => {
    const handleResize = () => {
      setWindowHeight(window.innerHeight)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const disabled = !base?.model?.id || !base?.model?.provider

  const estimateSize = useCallback(() => 75, [])

  if (!base) {
    return null
  }

  const handleAddFile = async () => {
    if (disabled) {
      window.toast?.info?.('请先在知识库设置中选择嵌入模型')
      return
    }
    if (selecting) {
      return
    }
    const selectedFiles = await onSelectFile({ multipleSelections: true })
    processFiles(selectedFiles)
  }

  const handleDrop = async (files: File[]) => {
    if (disabled) {
      return
    }
    if (files) {
      const _files: FileMetadata[] = files
        .map((file) => {
          // 这个路径 filePath 很可能是在文件选择时的原始路径。
          const filePath = window.api.file.getPathForFile(file)
          let nameFromPath = filePath
          const lastSlash = filePath.lastIndexOf('/')
          const lastBackslash = filePath.lastIndexOf('\\')
          if (lastSlash !== -1 || lastBackslash !== -1) {
            nameFromPath = filePath.substring(Math.max(lastSlash, lastBackslash) + 1)
          }

          // 从派生的文件名中获取扩展名
          const extFromPath = nameFromPath.includes('.') ? `.${nameFromPath.split('.').pop()}` : ''

          return {
            id: uuid(),
            name: nameFromPath, // 使用从路径派生的文件名
            path: filePath,
            size: file.size,
            ext: extFromPath.toLowerCase(),
            count: 1,
            origin_name: file.name, // 保存 File 对象中原始的文件名
            type: mime2type(file.type),
            created_at: new Date().toISOString()
          }
        })
        .filter(({ ext }) => fileTypes.includes(ext))
      processFiles(_files)
    }
  }

  const processFiles = async (files: FileMetadata[]) => {
    logger.debug('processFiles', files)
    if (files.length > 0) {
      if (!isRealElectron) {
        addFiles(files)
        return
      }
      const uploadedFiles = await FileManager.uploadFiles(files)
      addFiles(uploadedFiles)
    }
  }

  const showPreprocessIcon = (item: KnowledgeItem) => {
    if (base.preprocessProvider && item.isPreprocessed !== false) {
      return true
    }
    if (!base.preprocessProvider && item.isPreprocessed === true) {
      return true
    }
    return false
  }

  const listItems = useMemo(() => [...fileItems].reverse(), [fileItems])

  return (
    <ItemContainer>
      <ItemHeader>
        {graphAction}
        <ResponsiveButton
          type="primary"
          icon={<PlusIcon size={16} />}
          onClick={(e) => {
            e.stopPropagation()
            handleAddFile()
          }}
          disabled={disabled}>
          {t('knowledge.add_file')}
        </ResponsiveButton>
      </ItemHeader>

      <ItemFlexColumn>
        {graphNotice}
        <div
          onClickCapture={(e) => {
            e.stopPropagation()
            handleAddFile()
          }}>
          <Dragger
            disabled={disabled}
            showUploadList={false}
            customRequest={({ file }) => handleDrop([file as File])}
            multiple={true}
            accept={fileTypes.join(',')}
            openFileDialogOnClick={false}>
            <p className="ant-upload-text">{t('knowledge.drag_file')}</p>
            <p className="ant-upload-hint">
              {t('knowledge.file_hint', { file_types: 'TXT, MD, HTML, PDF, DOCX, PPTX, XLSX, EPUB...' })}
            </p>
          </Dragger>
        </div>
        {fileItems.length === 0 ? (
          <KnowledgeEmptyView />
        ) : (
          <DynamicVirtualList
            list={listItems}
            estimateSize={estimateSize}
            overscan={2}
            scrollerStyle={{ height: windowHeight - 270 }}
            autoHideScrollbar>
            {(item) => {
              if (!isKnowledgeFileItem(item)) {
                return null
              }
              const file = item.content
              return (
                <div style={{ height: '75px', paddingTop: '12px' }}>
                  <FileItem
                    key={item.id}
                    fileInfo={{
                      name: (
                        <ClickableSpan onClick={() => window.api.file.openFileWithRelativePath(file)}>
                          <Ellipsis>
                            <Tooltip title={file.origin_name}>{file.origin_name}</Tooltip>
                          </Ellipsis>
                        </ClickableSpan>
                      ),
                      ext: file.ext,
                      extra: (
                        <>
                          <span>{`${getDisplayTime(item)} · ${formatFileSize(file.size)}`}</span>
                          {item.processingStatus === 'processing' && item.processingMessage && (
                            <ProcessingHint> · {item.processingMessage}</ProcessingHint>
                          )}
                        </>
                      ),
                      actions: (
                        <FlexAlignCenter>
                          {item.uniqueId && (
                            <Button type="text" icon={<RefreshIcon />} onClick={() => refreshItem(item)} />
                          )}
                          {showPreprocessIcon(item) && (
                            <StatusIconWrapper>
                              <StatusIcon
                                sourceId={item.id}
                                base={base}
                                getProcessingStatus={getProcessingStatus}
                                type="file"
                                isPreprocessed={preprocessMap.get(item.id) || item.isPreprocessed || false}
                                progress={progressMap.get(item.id)}
                              />
                            </StatusIconWrapper>
                          )}
                          <StatusIconWrapper>
                            <StatusIcon
                              sourceId={item.id}
                              base={base}
                              getProcessingStatus={getProcessingStatus}
                              type="file"
                              progress={item.processingProgress}
                            />
                          </StatusIconWrapper>
                          <Button
                            type="text"
                            danger
                            onClick={() => removeItem(item)}
                            icon={<DeleteIcon size={14} className="lucide-custom" />}
                          />
                        </FlexAlignCenter>
                      )
                    }}
                  />
                </div>
              )
            }}
          </DynamicVirtualList>
        )}
      </ItemFlexColumn>
    </ItemContainer>
  )
}

const ItemFlexColumn = styled.div`
  display: flex;
  flex-direction: column;
  padding: 20px 16px;
  gap: 10px;
`

const ProcessingHint = styled.span`
  color: var(--color-primary);
  font-weight: 500;
`

export default KnowledgeFiles
