import { useState } from 'react';
import { Box, Button, FormControl, FormLabel, Input, VStack, Text, Card, CardBody, Heading, Textarea, HStack, IconButton } from '@chakra-ui/react';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [notes, setNotes] = useState([
    { id: 1, text: '欢迎使用记事本' }
  ]);
  const [newNote, setNewNote] = useState('');
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(username, password);
    } catch (err) {
      // 静默失败 - 留在记事本
    } finally {
      setLoading(false);
    }
  };

  const addNote = () => {
    if (newNote.trim()) {
      setNotes([...notes, { id: Date.now(), text: newNote }]);
      setNewNote('');
    }
  };

  const deleteNote = (id) => {
    setNotes(notes.filter(n => n.id !== id));
  };

  // 直接显示记事本 + 登录按钮
  return (
    <Box minH="100vh" bg="gray.900" p={4}>
      <Card maxW="600px" mx="auto" mt={8} bg="gray.800" shadow="lg">
        <CardBody p={6}>
          <HStack justify="space-between" mb={4}>
            <Heading size="md" color="white">记事本</Heading>
            {!showLogin && (
              <Button size="sm" colorScheme="blue" variant="outline" onClick={() => setShowLogin(true)}>
                登录
              </Button>
            )}
          </HStack>

          {showLogin ? (
            <form onSubmit={handleSubmit}>
              <VStack spacing={3}>
                <FormControl>
                  <FormLabel color="gray.600" fontSize="sm">用户名</FormLabel>
                  <Input
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="请输入用户名"
                    bg="gray.700" color="white"
                    size="sm"
                  />
                </FormControl>
                <FormControl>
                  <FormLabel color="gray.600" fontSize="sm">密码</FormLabel>
                  <Input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="请输入密码"
                    bg="gray.700" color="white"
                    size="sm"
                  />
                </FormControl>
                <HStack w="100%">
                  <Button type="submit" colorScheme="blue" size="sm" flex={1} isLoading={loading}>
                    确定
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowLogin(false)}>
                    取消
                  </Button>
                </HStack>
              </VStack>
            </form>
          ) : (
            <>
              <HStack mb={4}>
                <Input
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  placeholder="写下新记录..."
                  bg="gray.700" color="white"
                  onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), addNote())}
                />
                <Button colorScheme="blue" onClick={addNote}>添加</Button>
              </HStack>

              <VStack spacing={2} align="stretch">
                {notes.map(note => (
                  <HStack key={note.id} p={3} bg="gray.700" color="white" borderRadius="md" justify="space-between">
                    <Text color="white" flex={1}>{note.text}</Text>
                    <IconButton
                      size="sm"
                      variant="ghost"
                      colorScheme="red"
                      onClick={() => deleteNote(note.id)}
                    >
                      <Text>×</Text>
                    </IconButton>
                  </HStack>
                ))}
                {notes.length === 0 && (
                  <Text color="gray.400" textAlign="center" py={4}>暂无记录</Text>
                )}
              </VStack>
            </>
          )}
        </CardBody>
      </Card>
    </Box>
  );
}
