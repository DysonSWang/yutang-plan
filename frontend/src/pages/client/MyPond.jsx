import { useState, useEffect } from 'react';
import { Box, Heading, Text, SimpleGrid, Card, CardBody, Badge, Tabs, TabList, TabPanels, Tab, TabPanel, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton, useDisclosure, HStack, VStack, Icon, Image, Flex } from '@chakra-ui/react';
import { HeartIcon } from '../../components/Icons';
import { girls, chatScreenshots } from '../../utils/api';

const STAGE_COLORS = {
  '陌生': 'gray',
  '搭讪': 'blue',
  '聊天': 'cyan',
  '暧昧': 'yellow',
  '约会': 'orange',
  '长期': 'green',
};

export default function MyPond() {
  const [girlsList, setGirls] = useState([]);
  const [allScreenshots, setAllScreenshots] = useState([]);
  const [selectedGirl, setSelectedGirl] = useState(null);
  const [girlScreenshots, setGirlScreenshots] = useState([]);
  const [previewImage, setPreviewImage] = useState(null);
  const { isOpen, onOpen, onClose } = useDisclosure();

  useEffect(() => {
    loadGirls();
    loadAllScreenshots();
  }, []);

  const loadGirls = async () => {
    try {
      const res = await girls.list();
      if (res.success) {
        setGirls(res.girls);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadAllScreenshots = async () => {
    try {
      const res = await chatScreenshots.my();
      if (res.success) {
        setAllScreenshots(res.screenshots);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const parseJSONField = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    try { return JSON.parse(val); } catch { return []; }
  };

  const viewGirlDetail = async (girl) => {
    setSelectedGirl(girl);
    setGirlScreenshots([]);
    try {
      const res = await chatScreenshots.my({ girlId: girl.id });
      if (res.success) {
        setGirlScreenshots(res.screenshots);
      }
    } catch (e) {
      console.error(e);
    }
    onOpen();
  };

  return (
    <Box>
      <Heading color="white" mb={6}>我的鱼塘</Heading>

      <Tabs variant="soft-rounded" colorScheme="teal">
        <TabList mb={4}>
          <Tab>女生资源</Tab>
          <Tab>交流记录</Tab>
        </TabList>

        <TabPanels>
          {/* 女生资源 */}
          <TabPanel p={0}>
            <SimpleGrid columns={3} spacing={4}>
              {girlsList.map(girl => (
                <Card key={girl.id} bg="gray.800" cursor="pointer" onClick={() => viewGirlDetail(girl)} _hover={{ bg: 'gray.700' }} transition="all 0.2s">
                  <CardBody>
                    <HStack justify="space-between" mb={2}>
                      <Text color="white" fontWeight="bold">{girl.name}</Text>
                      <Badge colorScheme={STAGE_COLORS[girl.stage] || 'gray'}>{girl.stage || '未知'}</Badge>
                    </HStack>
                    <Text color="gray.400" fontSize="sm">
                      {girl.age ? `${girl.age}岁` : ''} {girl.occupation || ''}
                    </Text>
                    <HStack mt={2} spacing={1}>
                      <Icon as={HeartIcon} color="red.400" w={3} h={3} />
                      <Text color="gray.500" fontSize="xs">亲密度 x{girl.intimacyLevel || 1}</Text>
                    </HStack>
                  </CardBody>
                </Card>
              ))}
              {girlsList.length === 0 && (
                <Text color="gray.500">暂无女生资源</Text>
              )}
            </SimpleGrid>
          </TabPanel>

          {/* 交流记录 - 截图时间线 */}
          <TabPanel p={0}>
            {allScreenshots.length === 0 ? (
              <Card bg="gray.800">
                <CardBody textAlign="center" py={10}>
                  <Text color="gray.500">暂无交流记录</Text>
                </CardBody>
              </Card>
            ) : (
              <VStack spacing={4} align="stretch">
                {allScreenshots.map(ss => (
                  <Card key={ss.id} bg="gray.800" cursor="pointer" onClick={() => setPreviewImage(`${import.meta.env.VITE_API_URL || 'http://localhost:3005'}${ss.imageUrl}`)} _hover={{ bg: 'gray.700' }} transition="all 0.2s">
                    <CardBody p={4}>
                      <Flex gap={4}>
                        <Image
                          src={`${import.meta.env.VITE_API_URL || 'http://localhost:3005'}${ss.imageUrl}`}
                          alt="聊天截图"
                          w="120px"
                          h="90px"
                          objectFit="cover"
                          borderRadius="md"
                          fallbackSrc="https://via.placeholder.com/120x90?text=..."
                        />
                        <Box flex={1}>
                          <HStack mb={2}>
                            <Text color="white" fontWeight="bold">{ss.girl?.name || '未知女生'}</Text>
                            <Badge colorScheme={STAGE_COLORS[ss.girl?.stage] || 'gray'} fontSize="xs">
                              {ss.girl?.stage || '未知'}
                            </Badge>
                          </HStack>
                          <Text color="gray.400" fontSize="sm" noOfLines={2}>
                            {ss.notes || '无备注'}
                          </Text>
                          <Text color="gray.500" fontSize="xs" mt={1}>
                            {new Date(ss.createdAt).toLocaleString()}
                          </Text>
                        </Box>
                      </Flex>
                    </CardBody>
                  </Card>
                ))}
              </VStack>
            )}
          </TabPanel>
        </TabPanels>
      </Tabs>

      {/* 女生详情弹窗 */}
      <Modal isOpen={isOpen} onClose={onClose} size="lg">
        <ModalOverlay />
        <ModalContent bg="gray.800">
          <ModalHeader color="white" pb={2}>
            <HStack justify="space-between">
              <HStack>
                <Text>{selectedGirl?.name}</Text>
                <Badge colorScheme={STAGE_COLORS[selectedGirl?.stage] || 'gray'}>
                  {selectedGirl?.stage || '未知'}
                </Badge>
              </HStack>
              <HStack spacing={2}>
                <Icon as={HeartIcon} color="red.400" />
                <Text color="teal.400" fontSize="sm">亲密度 x{selectedGirl?.intimacyLevel || 1}</Text>
              </HStack>
            </HStack>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            {/* 女生基本信息 */}
            <Box bg="gray.700" p={4} borderRadius="md" mb={4}>
              <Text color="gray.400" fontSize="xs" mb={2}>基本信息</Text>
              <SimpleGrid columns={3} spacing={4}>
                <Box>
                  <Text color="gray.500" fontSize="xs">年龄</Text>
                  <Text color="white">{selectedGirl?.age ? `${selectedGirl.age}岁` : '-'}</Text>
                </Box>
                <Box>
                  <Text color="gray.500" fontSize="xs">职业</Text>
                  <Text color="white">{selectedGirl?.occupation || '-'}</Text>
                </Box>
                <Box>
                  <Text color="gray.500" fontSize="xs">城市</Text>
                  <Text color="white">{selectedGirl?.residence || selectedGirl?.hometown || '-'}</Text>
                </Box>
              </SimpleGrid>
              {selectedGirl?.personality && (
                <Box mt={3}>
                  <Text color="gray.500" fontSize="xs">性格特点</Text>
                  <Text color="gray.300" fontSize="sm">{selectedGirl.personality}</Text>
                </Box>
              )}
              {selectedGirl?.interests && (
                <Box mt={2}>
                  <Text color="gray.500" fontSize="xs">兴趣爱好</Text>
                  <Text color="gray.300" fontSize="sm">{selectedGirl.interests}</Text>
                </Box>
              )}
            </Box>

            {/* 照片 */}
            {selectedGirl?.photos && parseJSONField(selectedGirl?.photos)?.length > 0 && (
              <Box mb={4}>
                <Text color="gray.400" fontSize="sm" mb={2}>照片</Text>
                <SimpleGrid columns={4} spacing={2}>
                  {parseJSONField(selectedGirl?.photos).map((url, i) => (
                    <Image key={i} src={url} alt="照片" h="80px" w="100%" objectFit="cover" borderRadius="md" cursor="pointer" onClick={() => setPreviewImage(url)} _hover={{ opacity: 0.8 }} fallbackSrc="https://via.placeholder.com/100x80?text=..." />
                  ))}
                </SimpleGrid>
              </Box>
            )}

            {/* 视频 */}
            {selectedGirl?.videos && parseJSONField(selectedGirl?.videos)?.length > 0 && (
              <Box mb={4}>
                <Text color="gray.400" fontSize="sm" mb={2}>视频</Text>
                <VStack spacing={2} align="stretch">
                  {parseJSONField(selectedGirl?.videos).map((url, i) => (
                    <Box key={i} p={2} bg="gray.700" borderRadius="md">
                      <Text as="a" href={url} color="teal.400" fontSize="sm" target="_blank">{url}</Text>
                    </Box>
                  ))}
                </VStack>
              </Box>
            )}

            {/* 主页链接 */}
            {selectedGirl?.homepageUrl && (
              <Box mb={4}>
                <Text color="gray.400" fontSize="sm" mb={1}>主页</Text>
                <Text as="a" href={selectedGirl.homepageUrl} color="teal.400" fontSize="sm" target="_blank">{selectedGirl.homepageUrl}</Text>
              </Box>
            )}

            {/* 交流截图 */}
            <Text color="gray.400" fontSize="sm" mb={2}>交流记录 ({girlScreenshots.length})</Text>
            {girlScreenshots.length === 0 ? (
              <Box p={4} bg="gray.700" borderRadius="md" textAlign="center">
                <Text color="gray.500">暂无交流记录</Text>
              </Box>
            ) : (
              <SimpleGrid columns={4} spacing={2}>
                {girlScreenshots.map(ss => (
                  <Image
                    key={ss.id}
                    src={`${import.meta.env.VITE_API_URL || 'http://localhost:3005'}${ss.imageUrl}`}
                    alt="截图"
                    w="100%"
                    h="80px"
                    objectFit="cover"
                    borderRadius="md"
                    cursor="pointer"
                    onClick={() => setPreviewImage(`${import.meta.env.VITE_API_URL || 'http://localhost:3005'}${ss.imageUrl}`)}
                    _hover={{ opacity: 0.8 }}
                    fallbackSrc="https://via.placeholder.com/100x80?text=..."
                  />
                ))}
              </SimpleGrid>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* 图片预览 */}
      <Modal isOpen={!!previewImage} onClose={() => setPreviewImage(null)} size="4xl">
        <ModalOverlay bg="blackAlpha.800" />
        <ModalContent bg="transparent" boxShadow="none">
          <ModalCloseButton color="white" zIndex={10} />
          <ModalBody p={0} display="flex" alignItems="center" justifyContent="center">
            {previewImage && (
              <Image src={previewImage} alt="预览" maxH="85vh" objectFit="contain" borderRadius="md" />
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
}
